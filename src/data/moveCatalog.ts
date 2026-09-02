import moveSlotsJson from "#data/moves/move-slots.json";
import movesJson from "#data/moves/moves.json";

/**
 * Loaders for the move catalog in data/.
 *
 * The JSON is the source of truth: adding a move or a slot should mean
 * editing data, never code. These helpers only index it for lookup and check
 * that the two files agree with each other.
 */

/** A slot is one input/state combination a move can be assigned to. */
export interface MoveSlot {
  slot_id: string;
  slot_display_name: string;
  position: string;
  category: string;
  category_id: string;
  group: string;
  actor_state: string[];
  target_state: string[];
  range: string;
  requires_special: boolean;
  trigger: "manual" | "automatic";
  input: string;
  input_pattern: InputPattern | null;
}

/** Structured matcher the engine compares live input against. */
export interface InputPattern {
  buttons?: string[] | null;
  mash_buttons?: string[] | null;
  button_alternatives?: string[][] | null;
  dpad?: string[] | null;
  control_stick?: string[] | null;
  modifier?: "tap" | "hold" | "rapid_tap" | null;
  requires_run?: boolean;
  release_run?: boolean;
}

/** A move is eligible for exactly the slots it lists in slot_ids. */
export interface CatalogMove {
  move_id: string;
  name: string;
  position: string;
  /**
   * Slot groups the move was drawn from. Descriptive only, and always a
   * superset: a move can belong to a group and still be excluded from some of
   * that group's slots, so eligibility is read from slot_ids, never from here.
   */
  groups: string[];
  /** The slots this move can fill. Authoritative. */
  slot_ids: string[];
  power: string | null;
  ko: boolean;
  bleed: boolean;
  feature: "pin" | "submit" | null;
  /** Animation clip id, or null while the move is unanimated. */
  animation_id: string | null;
}

const slots = (moveSlotsJson as { slots: MoveSlot[] }).slots;
const moves = (movesJson as { moves: CatalogMove[] }).moves;

export const MOVE_SLOTS: readonly MoveSlot[] = slots;
export const CATALOG_MOVES: readonly CatalogMove[] = moves;

const slotsById = new Map(slots.map((s) => [s.slot_id, s]));

/**
 * Slots indexed by group. Moves reference groups rather than individual
 * slots, so this is the lookup the resolver needs.
 */
const slotsByGroup = new Map<string, MoveSlot[]>();
for (const slot of slots) {
  const list = slotsByGroup.get(slot.group);
  if (list) list.push(slot);
  else slotsByGroup.set(slot.group, [slot]);
}

/** Moves indexed by the slots they can fill - the engine's main lookup. */
const movesBySlot = new Map<string, CatalogMove[]>();
for (const move of moves) {
  for (const slotId of move.slot_ids) {
    const list = movesBySlot.get(slotId);
    if (list) list.push(move);
    else movesBySlot.set(slotId, [move]);
  }
}

/**
 * Moves indexed by (position, move_id).
 *
 * moves.json describes that pair as unique, but it is not: 14 ids repeat
 * within a position as deliberate variants of the same move - a Fallaway Slam
 * exists as both a power D and a power E grapple. So this maps to a list
 * rather than a single entry; keying to one would silently drop variants.
 */
const movesByKey = new Map<string, CatalogMove[]>();
for (const move of moves) {
  const key = `${move.position}:${move.move_id}`;
  const list = movesByKey.get(key);
  if (list) list.push(move);
  else movesByKey.set(key, [move]);
}

export function slotById(slotId: string): MoveSlot | null {
  return slotsById.get(slotId) ?? null;
}

export function slotsInGroup(group: string): readonly MoveSlot[] {
  return slotsByGroup.get(group) ?? [];
}

/** Every variant sharing a position and move id. Usually one, sometimes two. */
export function movesById(position: string, moveId: string): CatalogMove[] {
  return movesByKey.get(`${position}:${moveId}`) ?? [];
}

/** Every slot a move is eligible for. Unknown slot ids are skipped. */
export function slotsForMove(move: CatalogMove): MoveSlot[] {
  return move.slot_ids
    .map((id) => slotsById.get(id))
    .filter((s): s is MoveSlot => s !== undefined);
}

/** Moves eligible for a given slot. */
export function movesForSlot(slot: MoveSlot): CatalogMove[] {
  return movesBySlot.get(slot.slot_id) ?? [];
}

export interface CatalogIssues {
  /**
   * Slot ids a move references that move-slots.json does not define. Those
   * entries can never be selected, so this is the genuinely broken case.
   */
  unknownSlots: string[];
  /**
   * Groups a move references that no slot defines. Cosmetic now that groups
   * are descriptive, but still a sign the two files have drifted.
   */
  unknownGroups: string[];
  /** Slots that exist but no move fills - playable but empty. */
  unfilledSlots: string[];
  /** (position, move_id) pairs used by more than one move. */
  duplicateIds: string[];
  /**
   * Moves assigned to groups from another position.
   *
   * Reported for visibility, not as an error: standing strikes are reused in
   * turnbuckle slots and running strikes in running-turnbuckle slots, which
   * is sensible even though moves.json describes positions as having to
   * match.
   */
  crossPositionGroups: string[];
}

/**
 * Cross-checks the two files against each other. Shape is the JSON schemas'
 * job; this covers the relationships between them, which no schema can see.
 */
export function validateCatalog(): CatalogIssues {
  const definedGroups = new Set(slots.map((s) => s.group));
  const usedGroups = new Set(moves.flatMap((m) => m.groups));
  const usedSlots = new Set(moves.flatMap((m) => m.slot_ids));

  const unknownSlots = [...usedSlots].filter((id) => !slotsById.has(id));
  const unknownGroups = [...usedGroups].filter((g) => !definedGroups.has(g));
  const unfilledSlots = slots
    .map((s) => s.slot_id)
    .filter((id) => !usedSlots.has(id));

  const duplicateIds = [...movesByKey.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key]) => key);

  const crossPositionGroups = new Set<string>();
  for (const move of moves) {
    for (const group of move.groups) {
      const slot = slotsInGroup(group)[0];
      if (slot && slot.position !== move.position) {
        crossPositionGroups.add(`${move.position} -> ${group} (${slot.position})`);
      }
    }
  }

  return {
    unknownSlots,
    unknownGroups,
    unfilledSlots,
    duplicateIds,
    crossPositionGroups: [...crossPositionGroups],
  };
}
