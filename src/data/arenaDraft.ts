import { ArenaData, arenaParts, availableArenas } from "./arenas";
import { knownAssetPaths } from "./assets";
import {
  PieceKind,
  availableStages,
  defaultPiece,
  pieceFitsStage,
  piecesFor,
} from "./stages";
import {
  TextureSlot,
  TEXTURE_SLOTS,
  colorTargets,
  knownColorKeys,
  pathBelongsToSlot,
  texturedMaterials,
} from "./textureSlots";

/**
 * The editable form of an arena, and the rules for turning one back into the
 * JSON that lives in data/arenas/.
 *
 * Kept apart from the editor component so the parts that can be got wrong -
 * what a valid id looks like, which keys survive a save, how a clone differs
 * from its source - are plain functions the unit suite can cover. The
 * component is then only responsible for showing them.
 */

export interface ArenaDraft {
  id: string;
  displayName: string;
  previewImage: string;
  /** Stage id from data/stages.json. Decides which pieces below are legal. */
  stage: string;
  floor: string;
  barricade: string;
  outer: string;
  arenaTextures: Record<string, string>;
  ringTextures: Record<string, string>;
}

/**
 * Ids are the filename, so they are constrained by the schema's pattern
 * rather than by taste: lowercase, starting with a letter.
 */
const ID_PATTERN = /^[a-z][a-z0-9_]*$/;

/** The three piece fields, in the order the editor shows them. */
export const PIECE_KINDS: PieceKind[] = ["floor", "barricade", "outer"];

/** A `*Color` key holds a CSS colour; everything else is an asset path. */
export function isColorKey(key: string): boolean {
  return key.endsWith("Color");
}

/**
 * Why this id cannot be used, or null when it can.
 *
 * `taken` is passed in rather than read from the registry so the caller can
 * decide whether renaming onto an existing arena counts as a clash - it does
 * when creating, but not when saving the arena you are already editing.
 */
export function idProblem(id: string, taken: Iterable<string>): string | null {
  if (!id) return "An id is required.";
  if (!ID_PATTERN.test(id)) {
    return "Use lowercase letters, digits and underscores, starting with a letter.";
  }
  for (const other of taken) {
    if (other === id) return `"${id}" already exists.`;
  }
  return null;
}

/** Every saved arena's id. */
export function existingIds(): string[] {
  return availableArenas({ includeHidden: true }).map((arena) => arena.id);
}

/**
 * The stage a legacy `arenaParts` list was built on.
 *
 * Files written before the stage fields existed name their four GLBs directly.
 * The stage GLB is the one that identifies the set, so it is matched against
 * the manifest and the rest of the list is discarded - the pieces are implied
 * by the stage, and a legacy file never held any that were not.
 */
function stageForLegacy(arena: ArenaData): string {
  const paths = new Set(arenaParts(arena).map((part) => part.glb));
  for (const stage of availableStages()) {
    if (paths.has(stage.glb)) return stage.id;
  }
  return availableStages()[0]?.id ?? "";
}

/**
 * Splits `ropeColor` into the three per-rope keys.
 *
 * The shared key set all three ropes at once. The editor offers a colour per
 * rope, which says the same thing and more, so a draft expands it on the way in
 * rather than showing a control the panel has no row for. An explicit per-rope
 * key already in the file wins, since it was the more specific instruction.
 */
function expandLegacyColors(textures: Record<string, string>): Record<string, string> {
  const out = { ...textures };
  const shared = out.ropeColor;
  if (!shared) return out;

  delete out.ropeColor;
  for (const key of ["ropeTopColor", "ropeMiddleColor", "ropeBottomColor"]) {
    out[key] ??= shared;
  }
  return out;
}

/** A draft of an arena that already exists. */
export function draftFromArena(arena: ArenaData): ArenaDraft {
  const stage = arena.stage || stageForLegacy(arena);
  return {
    id: arena.id,
    displayName: arena.displayName ?? arena.id,
    previewImage: arena.previewImage ?? "",
    stage,
    // A piece the file does not name - or names with something that does not
    // fit the stage, which a hand-edit can do - falls back to the stage's own
    // default, so the draft always describes a loadable arena.
    floor: resolvePiece(stage, "floor", arena.floor),
    barricade: resolvePiece(stage, "barricade", arena.barricade),
    outer: resolvePiece(stage, "outer", arena.outer),
    arenaTextures: expandLegacyColors(arena.arenaTextures ?? {}),
    ringTextures: expandLegacyColors(arena.ringTextures ?? {}),
  };
}

function resolvePiece(
  stage: string,
  kind: PieceKind,
  glb: string | undefined
): string {
  if (glb && pieceFitsStage(stage, kind, glb)) return glb;
  return defaultPiece(stage, kind);
}

/**
 * Points a draft at a different stage, bringing its pieces with it.
 *
 * Pieces are per-stage, so the ones that were selected are almost never valid
 * for the new stage - they are modelled to meet a different entrance. Rather
 * than leave three fields pointing at parts that no longer fit, each is reset
 * to the new stage's default unless it happens to be listed there too.
 */
export function selectStage(draft: ArenaDraft, stage: string): void {
  draft.stage = stage;
  for (const kind of PIECE_KINDS) {
    draft[kind] = resolvePiece(stage, kind, draft[kind]);
  }
}

/** The pieces of one kind this draft may choose between. */
export function pieceOptions(draft: ArenaDraft, kind: PieceKind): string[] {
  return piecesFor(draft.stage, kind);
}

/**
 * A new arena based on an existing one.
 *
 * Everything is copied except the preview image, which is art made for the
 * arena it came from - carrying it over would put the wrong picture next to
 * the new name in the viewer's list.
 */
export function cloneArena(
  source: ArenaData,
  id: string,
  displayName: string
): ArenaDraft {
  return {
    ...draftFromArena(source),
    id,
    displayName,
    previewImage: "",
  };
}

/**
 * The draft as it should be written to data/arenas/<id>.json.
 *
 * Empty maps and blank strings are dropped rather than written as `{}` or
 * `""`: the schema makes those fields optional, and an absent key reads as
 * "not set" where an empty one reads as "deliberately nothing".
 */
export function draftToJson(draft: ArenaDraft): ArenaData {
  const out: ArenaData = {
    id: draft.id,
    displayName: draft.displayName,
  };

  if (draft.previewImage) out.previewImage = draft.previewImage;

  out.stage = draft.stage;
  for (const kind of PIECE_KINDS) {
    if (draft[kind]) out[kind] = draft[kind];
  }

  const arenaTextures = pruneUnknown(draft.arenaTextures);
  if (Object.keys(arenaTextures).length) out.arenaTextures = arenaTextures;

  const ringTextures = pruneUnknown(draft.ringTextures);
  if (Object.keys(ringTextures).length) out.ringTextures = ringTextures;

  return out;
}

const WRITABLE_KEYS = new Set([...texturedMaterials(), ...knownColorKeys()]);

/**
 * Drops keys that are blank, and keys nothing in the registry can act on.
 *
 * A blank value would resolve to nothing; an unknown key is worse, because it
 * looks like a setting while doing nothing at all. Stage materials are the
 * common case - a file written before stages were chosen wholesale may still
 * name `mat_large_curtain`, which is now baked into the GLB - and a save is
 * where they get cleaned out.
 */
function pruneUnknown(map: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(map)) {
    if (typeof value !== "string" || !value.trim()) continue;
    if (!WRITABLE_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

/**
 * The draft as live arena data, for rendering before it is saved.
 *
 * Same shape as the file, so the preview shows exactly what saving would
 * produce rather than an approximation of it.
 */
export function draftToArenaData(draft: ArenaDraft): ArenaData {
  return { ...draftToJson(draft), id: draft.id || "draft" };
}

/** Bundled asset paths under a directory, filtered by extension. */
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];

function isImage(path: string): boolean {
  const lower = path.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * The art a slot can be set to.
 *
 * This is what keeps the pickers usable: a slot lists the folders its art lives
 * in, and only those files are offered. Before slots existed every dropdown
 * held all ~190 bundled images, including preview thumbnails and stage art that
 * would never belong on a canvas.
 */
export function texturesForSlot(slot: TextureSlot): string[] {
  if (!slot.folders.length) return [];
  return knownAssetPaths()
    .filter((path) => isImage(path) && pathBelongsToSlot(slot, path))
    .sort();
}

/** Every slot that has something to pick, keyed by id. For the editor. */
export function slotTextureOptions(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const slot of TEXTURE_SLOTS) out[slot.id] = texturesForSlot(slot);
  return out;
}

/** Every image that could serve as an arena's preview. */
export function availablePreviews(): string[] {
  return knownAssetPaths()
    .filter(
      (path) =>
        path.startsWith("assets/textures/arena/previews/") && isImage(path)
    )
    .sort();
}

/**
 * Texture keys in a draft that the editor has no control for.
 *
 * Shown as a warning rather than silently dropped, so a file that still names a
 * stage material says so before a save quietly removes it.
 */
export function unknownKeys(draft: ArenaDraft): string[] {
  const keys: string[] = [];
  for (const map of [draft.arenaTextures, draft.ringTextures]) {
    for (const key of Object.keys(map)) {
      if (!WRITABLE_KEYS.has(key)) keys.push(key);
    }
  }
  return keys.sort();
}

/** Re-exported so the editor imports its slot vocabulary from one place. */
export { colorTargets, TEXTURE_SLOTS };
export type { TextureSlot };
