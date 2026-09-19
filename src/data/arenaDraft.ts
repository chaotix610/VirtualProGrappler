import {
  ArenaData,
  ArenaPartSpec,
  arenaParts,
  availableArenas,
} from "./arenas";
import { knownAssetPaths } from "./assets";

/**
 * The editable form of an arena, and the rules for turning one back into the
 * JSON that lives in data/arenas/.
 *
 * Kept apart from the editor component so the parts that can be got wrong -
 * what a valid id looks like, which keys survive a save, how a clone differs
 * from its source - are plain functions the unit suite can cover. The
 * component is then only responsible for showing them.
 */

/** A part always carries its placement while being edited, never `undefined`. */
export interface DraftPart {
  glb: string;
  position: [number, number, number];
  rotation: [number, number, number];
}

export interface ArenaDraft {
  id: string;
  displayName: string;
  previewImage: string;
  parts: DraftPart[];
  arenaTextures: Record<string, string>;
  ringTextures: Record<string, string>;
}

/**
 * Ids are the filename, so they are constrained by the schema's pattern
 * rather than by taste: lowercase, starting with a letter.
 */
const ID_PATTERN = /^[a-z][a-z0-9_]*$/;

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
  return availableArenas().map((arena) => arena.id);
}

/** A draft of an arena that already exists. */
export function draftFromArena(arena: ArenaData): ArenaDraft {
  return {
    id: arena.id,
    displayName: arena.displayName ?? arena.id,
    previewImage: arena.previewImage ?? "",
    // arenaParts() collapses the bare-string and object forms, and the legacy
    // arenaGlb field, into one shape - so editing never has to know which
    // spelling the file happened to use.
    parts: arenaParts(arena).map((part) => ({
      glb: part.glb,
      position: [...part.position] as [number, number, number],
      rotation: [...part.rotation] as [number, number, number],
    })),
    arenaTextures: { ...(arena.arenaTextures ?? {}) },
    ringTextures: { ...(arena.ringTextures ?? {}) },
  };
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
 *
 * A part with no offset is written as a bare path, which is how every arena
 * file is currently spelled, so saving an untouched arena is a no-op diff
 * rather than a rewrite of every line.
 */
export function draftToJson(draft: ArenaDraft): ArenaData {
  const out: ArenaData = {
    id: draft.id,
    displayName: draft.displayName,
  };

  if (draft.previewImage) out.previewImage = draft.previewImage;

  out.arenaParts = draft.parts
    .filter((part) => part.glb)
    .map((part) => partToJson(part));

  const arenaTextures = pruneBlank(draft.arenaTextures);
  if (Object.keys(arenaTextures).length) out.arenaTextures = arenaTextures;

  const ringTextures = pruneBlank(draft.ringTextures);
  if (Object.keys(ringTextures).length) out.ringTextures = ringTextures;

  return out;
}

function partToJson(part: DraftPart): string | ArenaPartSpec {
  const moved = part.position.some((n) => n !== 0);
  const turned = part.rotation.some((n) => n !== 0);
  if (!moved && !turned) return part.glb;

  const spec: ArenaPartSpec = { glb: part.glb };
  if (moved) spec.position = [...part.position] as [number, number, number];
  if (turned) spec.rotation = [...part.rotation] as [number, number, number];
  return spec;
}

/** Drops keys whose value is blank, so they do not reach the file. */
function pruneBlank(map: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(map)) {
    if (typeof value === "string" && value.trim()) out[key] = value;
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
function assetsMatching(prefix: string, extensions: string[]): string[] {
  return knownAssetPaths()
    .filter(
      (path) =>
        path.startsWith(prefix) &&
        extensions.some((ext) => path.toLowerCase().endsWith(ext))
    )
    .sort();
}

/** Every GLB the editor can offer as an arena part. */
export function availableGlbs(): string[] {
  return assetsMatching("assets/glb/arena/", [".glb"]);
}

/** Every texture the editor can offer for a material. */
export function availableTextures(): string[] {
  return assetsMatching("assets/textures/", [
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
  ]);
}

/** Every image that could serve as an arena's preview. */
export function availablePreviews(): string[] {
  return assetsMatching("assets/textures/arena/previews/", [
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
  ]);
}
