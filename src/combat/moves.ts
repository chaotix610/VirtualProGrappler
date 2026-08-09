import { SIM_HZ } from "../sim/FixedStep";
import { MoveData } from "./types";

/**
 * Move database.
 *
 * Only the strikes that already have animations are defined so far. Slot ids
 * follow move-slot-overview.md so entries can be looked up by the slot
 * resolver once grappling exists.
 *
 * Frame numbers are derived from the baked clip lengths, converted to
 * simulation frames, so the hit lands when the animation looks like it should.
 */

const seconds = (s: number) => Math.round(s * SIM_HZ);

export const MOVES: Record<string, MoveData> = {
  /** Punch_Cross, 1.00s. A weak arm strike to the head. */
  "weak-arm-strike-1": {
    id: "weak-arm-strike-1",
    slot: "weak-arm-strike-1",
    name: "Cross Punch",
    baseHealthDamage: 8,
    bodyPartUsed: "arms",
    bodyPartHit: "head",
    jointStaminaDamage: { head: 1.5 },
    totalFrames: seconds(1.0),
    // Contact lands a third of the way in, as the arm extends.
    hitFrames: [seconds(0.32)],
    reversalWindow: { start: seconds(0.2), end: seconds(0.32) },
  },

  /**
   * Sword_Attack standing in for a kick, 1.53s. A leg strike to the body.
   * Swap the clip and this entry together when a real kick exists.
   */
  "weak-leg-strike-1": {
    id: "weak-leg-strike-1",
    slot: "weak-leg-strike-1",
    name: "Standing Kick",
    baseHealthDamage: 11,
    bodyPartUsed: "legs",
    bodyPartHit: "body",
    jointStaminaDamage: { body: 2 },
    totalFrames: seconds(1.53),
    hitFrames: [seconds(0.5)],
    reversalWindow: { start: seconds(0.34), end: seconds(0.5) },
  },

  /** NinjaJump off the top rope: a flying attack, hence the flying pools. */
  "flying-top-turnbuckle-standing-opponent": {
    id: "flying-top-turnbuckle-standing-opponent",
    slot: "flying-top-turnbuckle-standing-opponent",
    name: "Top Rope Dive",
    baseHealthDamage: 18,
    bodyPartUsed: "flying",
    bodyPartHit: "body",
    jointStaminaDamage: { body: 3, flying: 2 },
    totalFrames: seconds(0.75),
    hitFrames: [seconds(0.45)],
    reversalWindow: { start: seconds(0.25), end: seconds(0.45) },
  },
};

export function moveById(id: string): MoveData | null {
  return MOVES[id] ?? null;
}
