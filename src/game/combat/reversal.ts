import { Rng } from "../sim/Rng";
import { WrestlerState } from "./types";

/**
 * Grapple reversal odds, transcribed from REVERSALS.md.
 *
 * Probabilities are kept on the console's 0-1000 scale throughout rather than
 * converted to floats, so the comparison against the RNG roll stays exact.
 */

export const PROBABILITY_SCALE = 1000;

/** REVERSALS.md: base probability by the defender's spirit band. */
export function spiritBandProbability(spirit: number): number {
  if (spirit >= 100) return 500;
  if (spirit >= 81) return 333;
  if (spirit >= 61) return 250;
  if (spirit >= 31) return 125;
  if (spirit >= 11) return 62;
  return 31;
}

export interface ReversalContext {
  attacker: WrestlerState;
  defender: WrestlerState;
  /** Strong grapples add the defender's health scaling. */
  strongGrapple: boolean;
}

/** Each step of the calculation, so a debug view can show the working. */
export interface ReversalOdds {
  /** Step 1: from the defender's spirit band. */
  base: number;
  /** Step 2: doubled when the defender outweighs the attacker by a band. */
  afterWeight: number;
  /** Step 3: strong-grapple health scaling. */
  afterHealth: number;
  /** Step 5: capped final probability, 0-1000. */
  probability: number;
  /** Step 4: Special! can disable reversals outright. */
  disabled: boolean;
  /** Human-readable reason when disabled. */
  reason?: string;
}

/**
 * REVERSALS.md step 2. Both weights are divided by three with integer
 * division first, so only a full band of weight difference counts - which is
 * why most wrestlers (weight 5, band 1) cancel each other out.
 */
export function weightAdvantage(
  attackerWeight: number,
  defenderWeight: number
): number {
  return Math.floor(defenderWeight / 3) - Math.floor(attackerWeight / 3);
}

/**
 * Computes the reversal probability without rolling.
 *
 * Ordering follows the document exactly: spirit, then weight, then strong
 * grapple health scaling, then the Special! override, then the cap.
 */
export function reversalOdds(context: ReversalContext): ReversalOdds {
  const { attacker, defender, strongGrapple } = context;

  const base = spiritBandProbability(defender.spirit);
  let p = base;

  // Step 2 - weight factor.
  const advantage = weightAdvantage(
    attacker.profile.weightFactor,
    defender.profile.weightFactor
  );
  if (advantage > 0) p *= 2;
  const afterWeight = p;

  // Step 3 - strong grapples scale on the defender's health, making them much
  // harder to land early in a match while the defender is still fresh.
  if (strongGrapple) {
    // A defender in Special! is measured against max health instead, so
    // chip damage does not erode their reversal odds.
    const health = defender.special ? defender.maxHealth : defender.currentHealth;
    if (health >= 192) p *= 4;
    else if (health >= 128) p *= 2;
  }
  const afterHealth = p;

  // Step 4 - Special! Many special grapples have no reversal animation, so
  // reversals are switched off unless the defender is also in Special!.
  if (attacker.special && !defender.special) {
    return {
      base,
      afterWeight,
      afterHealth,
      probability: 0,
      disabled: true,
      reason: "attacker in Special!, defender is not",
    };
  }

  // Step 5 - cap.
  return {
    base,
    afterWeight,
    afterHealth,
    probability: Math.min(p, PROBABILITY_SCALE),
    disabled: false,
  };
}

export interface ReversalResult extends ReversalOdds {
  /** The consumed pre-rolled value, 0-999. */
  roll: number;
  reversed: boolean;
}

/**
 * REVERSALS.md step 6: consume a pre-rolled value and compare. Note the roll
 * is taken even when the odds are zero, so the RNG sequence advances the same
 * way regardless of outcome.
 */
export function rollReversal(
  context: ReversalContext,
  rng: Rng
): ReversalResult {
  const odds = reversalOdds(context);
  const roll = rng.nextReversalRoll();
  return {
    ...odds,
    roll,
    reversed: !odds.disabled && roll < odds.probability,
  };
}
