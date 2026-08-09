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
  player_state: string[];
  opponent_state: string[];
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

/** A move becomes eligible for every slot in any group it lists. */
export interface CatalogMove {
  move_id: string;
  name: string;
  position: string;
  groups: string[];
  power: string | null;
  ko: boolean;
  bleed: boolean;
  feature: "pin" | "submit" | null;
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

/**
 * Moves indexed by (position, move_id).
 *
 * moves.json describes that pair as unique, but it is not: 62 ids appear
 * twice, as deliberate variants of the same move - an Abdominal Stretch
 * exists as both a weak (power E) and a strong (power F) grapple. So this
 * maps to a list rather than a single entry; keying to one would silently
 * drop half of each pair.
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

/** Every slot a move is eligible for, via the groups it belongs to. */
export function slotsForMove(move: CatalogMove): MoveSlot[] {
  return move.groups.flatMap((g) => [...slotsInGroup(g)]);
}

/** Moves eligible for a given slot. */
export function movesForSlot(slot: MoveSlot): CatalogMove[] {
  return moves.filter((m) => m.groups.includes(slot.group));
}

export interface CatalogIssues {
  /**
   * Groups a move references that no slot defines. Moves in these groups can
   * never be selected, so this is the one genuinely broken case.
   */
  unknownGroups: string[];
  /** Groups with slots but no move assigned - playable but empty. */
  emptyGroups: string[];
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

  const unknownGroups = [...usedGroups].filter((g) => !definedGroups.has(g));
  const emptyGroups = [...definedGroups].filter((g) => !usedGroups.has(g));

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
    unknownGroups,
    emptyGroups,
    duplicateIds,
    crossPositionGroups: [...crossPositionGroups],
  };
}
