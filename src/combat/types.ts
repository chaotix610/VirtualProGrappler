/**
 * Core combat data types, transcribed from docs/mechanics.
 *
 * Sources:
 *  - Parameters.md      - the ten offence/defence parameters
 *  - move-damage.md     - health, joint stamina, move fields
 *  - REVERSALS.md       - weight factor, spirit, Special!
 */

/** The five categories every parameter, stamina pool and move maps onto. */
export type BodyPart = "head" | "body" | "arms" | "legs" | "flying";

export const BODY_PARTS: BodyPart[] = ["head", "body", "arms", "legs", "flying"];

/** Parameters.md: five offensive and five defensive values, each 1-5. */
export type ParameterSet = Record<BodyPart, number>;

/** move-damage.md 6.2: affects every repeating move, not only submissions. */
export type SubmissionSkill = "novice" | "normal" | "expert";

/** Static profile of a wrestler. Never mutated during a match. */
export interface WrestlerProfile {
  id: string;
  name: string;
  /** Damage dealt, keyed by the body part the wrestler *uses*. */
  offense: ParameterSet;
  /** Damage resisted, keyed by the body part being *hit*. */
  defense: ParameterSet;
  /** REVERSALS.md: 0-7, heavier is higher. */
  weightFactor: number;
  submissionSkill: SubmissionSkill;
}

/** Everything about a wrestler that changes during a match. */
export interface WrestlerState {
  profile: WrestlerProfile;
  /** move-damage.md 1.1: starts at 255, regenerates up to maxHealth. */
  currentHealth: number;
  /** move-damage.md 1.2: starts at 255, never regenerates, never below 64. */
  maxHealth: number;
  /** move-damage.md 2: five pools starting at 50.0, never recovering. */
  jointStamina: Record<BodyPart, number>;
  /** REVERSALS.md: 0-100, drives reversal probability. */
  spirit: number;
  /** Special! mode changes both damage and reversal rules. */
  special: boolean;
}

/** move-damage.md 3: what a single move does. */
export interface MoveData {
  id: string;
  /** Slot from move-slot-overview.md, e.g. "front-weak-grapple-1". */
  slot: string;
  name: string;
  /** Base Health Damage, the `D` in every damage factor. */
  baseHealthDamage: number;
  /** Body part the attacker uses, selecting their offense parameter. */
  bodyPartUsed: BodyPart;
  /** Body part struck, selecting the defender's defense parameter. */
  bodyPartHit: BodyPart;
  /** Joint stamina taken off each pool. Omitted pools take nothing. */
  jointStaminaDamage: Partial<Record<BodyPart, number>>;
  /**
   * move-damage.md 5.1: byte 0x1C = 08. Technical moves log and reduce max
   * health but take nothing off current health.
   */
  technical?: boolean;
  /** Grapples flagged strong get the defender's health scaling on reversal. */
  strongGrapple?: boolean;
  /** Repeating phase of a submission or multi-hit move. */
  repeating?: boolean;
  /** Total frames the move occupies, at the simulation's fixed rate. */
  totalFrames: number;
  /** Frames on which the move can connect. */
  hitFrames: number[];
  /** Inclusive frame window in which a reversal input is accepted. */
  reversalWindow?: { start: number; end: number };
}

export const STARTING_HEALTH = 255;
export const MIN_MAX_HEALTH = 64;
export const STARTING_JOINT_STAMINA = 50;
/** move-damage.md 2.2: below this the wrestler visibly holds the limb. */
export const LIMB_HELD_THRESHOLD = 15;

/** A fresh wrestler at the opening bell. */
export function createWrestlerState(profile: WrestlerProfile): WrestlerState {
  return {
    profile,
    currentHealth: STARTING_HEALTH,
    maxHealth: STARTING_HEALTH,
    jointStamina: {
      head: STARTING_JOINT_STAMINA,
      body: STARTING_JOINT_STAMINA,
      arms: STARTING_JOINT_STAMINA,
      legs: STARTING_JOINT_STAMINA,
      flying: STARTING_JOINT_STAMINA,
    },
    spirit: 0,
    special: false,
  };
}

/**
 * move-damage.md 2.2: the most damaged limb under the threshold, which is the
 * one the wrestler holds. Flying is excluded - it is an abstract pool with no
 * matching body part to clutch.
 */
export function heldLimb(state: WrestlerState): BodyPart | null {
  let worst: BodyPart | null = null;
  for (const part of BODY_PARTS) {
    if (part === "flying") continue;
    const value = state.jointStamina[part];
    if (value >= LIMB_HELD_THRESHOLD) continue;
    if (worst === null || value < state.jointStamina[worst]) worst = part;
  }
  return worst;
}
