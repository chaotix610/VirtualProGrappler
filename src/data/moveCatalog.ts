import moveSlotsJson from "#data/combat/move-slots.json";
import movesJson from "#data/combat/moves.json";

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
  /** The performing wrestler's clip (a GLB file name), or null while unanimated. */
  actor_animation_id: string | null;
  /** The receiving wrestler's clip, or null while unanimated. */
  target_animation_id: string | null;
  /** Per-slot replacement clips, keyed by slot id; empty for most moves. */
  slot_animation_overrides: Record<string, string | null>;
}

/**
 * A move as the version-3 catalog stores it: every field a string, the way a
 * spreadsheet row holds it. Lists are comma-separated, booleans are "true" or
 * "false", absent values are the literal "null", and slot overrides are
 * "slot_id:clip;slot_id:clip". data/schemas/moves.schema.json checks that
 * shape, so this loader parses it without re-validating.
 */
interface StoredMove {
  move_id: string;
  name: string;
  position: string;
  groups: string;
  slot_ids: string;
  power: string;
  ko: string;
  bleed: string;
  feature: string;
  actor_animation_id: string;
  target_animation_id: string;
  slot_animation_overrides: string;
}

const nullable = (value: string): string | null => (value === "null" ? null : value);
const list = (value: string): string[] => value.split(",").filter(Boolean);

function parseOverrides(value: string): Record<string, string | null> {
  const overrides: Record<string, string | null> = {};
  for (const pair of value.split(";").filter(Boolean)) {
    const at = pair.indexOf(":");
    overrides[pair.slice(0, at)] = nullable(pair.slice(at + 1));
  }
  return overrides;
}

/** One stored row as the typed move everything else works with. */
export function parseMove(stored: StoredMove): CatalogMove {
  return {
    move_id: stored.move_id,
    name: stored.name,
    position: stored.position,
    groups: list(stored.groups),
    slot_ids: list(stored.slot_ids),
    power: nullable(stored.power),
    ko: stored.ko === "true",
    bleed: stored.bleed === "true",
    feature: nullable(stored.feature) as CatalogMove["feature"],
    actor_animation_id: nullable(stored.actor_animation_id),
    target_animation_id: nullable(stored.target_animation_id),
    slot_animation_overrides: parseOverrides(stored.slot_animation_overrides),
  };
}

const slots = (moveSlotsJson as { slots: MoveSlot[] }).slots;
const moves = (movesJson as { moves: StoredMove[] }).moves.map(parseMove);

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
 * The version-3 catalog makes that pair unique - weak and strong variants of
 * a move have their own ids now and share only a display name - but this still
 * maps to a list, so a repeated pair would be reported by validateCatalog()
 * rather than one of its moves being silently dropped.
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
