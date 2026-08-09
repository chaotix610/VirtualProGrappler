import {
  BODY_PARTS,
  BodyPart,
  MIN_MAX_HEALTH,
  MoveData,
  SubmissionSkill,
  WrestlerState,
} from "./types";

/**
 * Damage calculation, transcribed from move-damage.md section 4.
 *
 * Every factor floors independently before being summed - that ordering is
 * load-bearing, since flooring the total instead would produce different
 * numbers than the console.
 */

/** The four factors, kept separate so a debug view can show the working. */
export interface DamageBreakdown {
  /** Factor 1: limb-stamina-adjusted base damage. */
  factor1: number;
  /** Factor 2: parameter bonus, never negative. */
  factor2: number;
  /** Factor 3: spirit bonus, capped at 5. */
  factor3: number;
  /** Sum before the Special! multiplier. */
  subtotal: number;
  /** Final main health damage after the Special! bonus. */
  mainHealthDamage: number;
  /** What actually comes off current health - zero for technical moves. */
  currentHealthDamage: number;
  /** Always a quarter of main damage, technical or not. */
  maxHealthDamage: number;
  /** Per-limb joint stamina taken off, after any submission skill bonus. */
  jointStaminaDamage: Partial<Record<BodyPart, number>>;
}

/**
 * move-damage.md 6.2: submission skill bonus applied per wrench of a
 * repeating move, indexed [attacker][defender].
 */
const SUBMISSION_SKILL_MATRIX: Record<
  SubmissionSkill,
  Record<SubmissionSkill, number>
> = {
  novice: { novice: 0, normal: -0.3, expert: -0.5 },
  normal: { novice: 0.3, normal: 0, expert: -0.3 },
  expert: { novice: 1.0, normal: 0.5, expert: 0 },
};

export function submissionSkillBonus(
  attacker: SubmissionSkill,
  defender: SubmissionSkill
): number {
  return SUBMISSION_SKILL_MATRIX[attacker][defender];
}

/**
 * Factor 1 - limb-stamina-adjusted base damage.
 * `floor((S + 50) * D * 0.01)`, where S is the attacker's stamina in the pool
 * for the body part they are using. An attacker in Special! is treated as
 * having a full 50, so a battered wrestler still hits at full strength.
 */
export function factor1(
  attacker: WrestlerState,
  move: MoveData
): number {
  const stamina = attacker.special
    ? 50
    : attacker.jointStamina[move.bodyPartUsed];
  return Math.floor((stamina + 50) * move.baseHealthDamage * 0.01);
}

/**
 * Factor 2 - parameter bonus.
 * `floor(max(0, A - B) * D * 0.1)`. A is the attacker's offense for the part
 * they use; B is the defender's defense for the part being hit. Equal values
 * cancel, and the bonus never goes negative.
 */
export function factor2(
  attacker: WrestlerState,
  defender: WrestlerState,
  move: MoveData
): number {
  const a = attacker.profile.offense[move.bodyPartUsed];
  const b = defender.profile.defense[move.bodyPartHit];
  return Math.floor(Math.max(0, a - b) * move.baseHealthDamage * 0.1);
}

/**
 * Factor 3 - spirit bonus.
 * `floor(dSpirit * 0.05)`, capped at 5: one point of damage per 20 points of
 * spirit advantage. A spirit deficit gives nothing rather than a penalty.
 */
export function factor3(
  attacker: WrestlerState,
  defender: WrestlerState
): number {
  const delta = attacker.spirit - defender.spirit;
  return Math.min(5, Math.max(0, Math.floor(delta * 0.05)));
}

/** Runs the full calculation without mutating either wrestler. */
export function calculateDamage(
  attacker: WrestlerState,
  defender: WrestlerState,
  move: MoveData
): DamageBreakdown {
  const f1 = factor1(attacker, move);
  const f2 = factor2(attacker, defender, move);
  const f3 = factor3(attacker, defender);
  const subtotal = f1 + f2 + f3;

  // Factor 4 - Special! multiplies the summed total, not the individual parts.
  const mainHealthDamage = attacker.special
    ? Math.floor(subtotal * 1.2)
    : subtotal;

  // Technical moves log damage and wear down max health, but leave current
  // health alone.
  const currentHealthDamage = move.technical ? 0 : mainHealthDamage;
  const maxHealthDamage = Math.floor(mainHealthDamage / 4);

  const bonus = move.repeating
    ? submissionSkillBonus(
        attacker.profile.submissionSkill,
        defender.profile.submissionSkill
      )
    : 0;

  const jointStaminaDamage: Partial<Record<BodyPart, number>> = {};
  for (const part of BODY_PARTS) {
    const base = move.jointStaminaDamage[part];
    if (base === undefined) continue;
    // The skill bonus applies per limb, and cannot heal.
    jointStaminaDamage[part] = Math.max(0, base + bonus);
  }

  return {
    factor1: f1,
    factor2: f2,
    factor3: f3,
    subtotal,
    mainHealthDamage,
    currentHealthDamage,
    maxHealthDamage,
    jointStaminaDamage,
  };
}

/**
 * Applies a calculated result to the defender, in place.
 *
 * Order matters: max health drops first, then current health is pulled down
 * to meet it, because move-damage.md 1.2 requires current never to sit above
 * max after a reduction.
 */
export function applyDamage(
  defender: WrestlerState,
  breakdown: DamageBreakdown
): void {
  defender.maxHealth = Math.max(
    MIN_MAX_HEALTH,
    defender.maxHealth - breakdown.maxHealthDamage
  );

  defender.currentHealth = Math.max(
    0,
    defender.currentHealth - breakdown.currentHealthDamage
  );
  defender.currentHealth = Math.min(defender.currentHealth, defender.maxHealth);

  for (const part of BODY_PARTS) {
    const amount = breakdown.jointStaminaDamage[part];
    if (amount === undefined) continue;
    defender.jointStamina[part] = Math.max(
      0,
      defender.jointStamina[part] - amount
    );
  }
}

/** Convenience: calculate and apply in one step. */
export function resolveMove(
  attacker: WrestlerState,
  defender: WrestlerState,
  move: MoveData
): DamageBreakdown {
  const breakdown = calculateDamage(attacker, defender, move);
  applyDamage(defender, breakdown);
  return breakdown;
}
