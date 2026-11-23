import { resolveAsset } from "./assets";
import { PieceKind, defaultPiece, stageById } from "./stages";

/**
 * Arena definitions, loaded from data/arenas/*.json.
 *
 * Imported rather than fetched: `data/` is outside Vite's publicDir, so
 * fetching these paths at runtime would 404 in a production build.
 *
 * The shapes mirror data/schemas/arenas.schema.json. `npm run validate:data`
 * checks the files against that schema, so this loader trusts the shape and
 * concerns itself only with normalising the parts of it that vary.
 */

/** A texture path, or a CSS colour for the `*Color` keys. */
export type MaterialTextures = Record<string, string>;

export interface ArenaPartSpec {
  glb: string;
  /** World offset, in the ring's units. */
  position?: [number, number, number];
  /** Euler radians, ordered [x, y, z]. Not a quaternion. */
  rotation?: [number, number, number];
}

export interface ArenaData {
  id: string;
  displayName: string;
  previewImage?: string;
  /** Leaves the arena out of the viewer and editor menus. It still loads by id. */
  hidden?: boolean;
  /** Stage id from data/stages.json. The current way to describe an arena. */
  stage?: string;
  /** Ringside floor GLB. One of the pieces the stage lists. */
  floor?: string;
  /** Ringside barricade GLB. One of the pieces the stage lists. */
  barricade?: string;
  /** Outer bowl GLB, crowd included. One of the pieces the stage lists. */
  outer?: string;
  /** Legacy single-GLB field, superseded by the stage fields. */
  arenaGlb?: string;
  /** Legacy free-form part list, superseded by the stage fields. */
  arenaParts?: (string | ArenaPartSpec)[];
  arenaTextures?: MaterialTextures;
  ringTextures?: MaterialTextures;
}

/** One entry in the viewer's selection list. */
export interface ArenaSummary {
  id: string;
  displayName: string;
  /** Resolved URL for the preview, or null when there is no art for it. */
  previewUrl: string | null;
}

const modules = import.meta.glob("../../data/arenas/*.json", {
  eager: true,
  import: "default",
}) as Record<string, ArenaData>;

const byId = new Map<string, ArenaData>();
for (const [path, data] of Object.entries(modules)) {
  // The filename is the id, so a mismatched `id` field cannot hide an arena.
  const id = path.split("/").pop()?.replace(/\.json$/i, "") ?? data.id;
  byId.set(id, { ...data, id });
}

/**
 * Every arena, ordered by display name.
 *
 * Arenas marked `hidden` are left out unless asked for, so they stay off the
 * menus while still counting when an id needs to be unique.
 */
export function availableArenas(
  { includeHidden = false }: { includeHidden?: boolean } = {}
): ArenaSummary[] {
  return [...byId.values()]
    .filter((arena) => includeHidden || arena.hidden !== true)
    .map((arena) => ({
      id: arena.id,
      displayName: arena.displayName ?? arena.id,
      previewUrl: arena.previewImage
        ? resolveAsset(arena.previewImage)
        : null,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function arenaById(id: string): ArenaData | null {
  return byId.get(id) ?? null;
}

/** The piece fields an arena fills in, in the order they are loaded. */
const PIECE_FIELDS: PieceKind[] = ["floor", "barricade", "outer"];

/**
 * The GLB parts of an arena, in a single shape.
 *
 * Three spellings reach this function. The current one names a `stage` and its
 * three pieces, which is what the editor writes. Before that an arena listed
 * `arenaParts` freely - a bare path or an object with a placement - and before
 * that a single `arenaGlb`. All three collapse into one placed list, so nothing
 * downstream needs to know which spelling a file happened to use.
 *
 * The stage form is checked first, so an arena carrying both (a file migrated
 * by hand, say) renders from the fields the editor maintains.
 */
export function arenaParts(arena: ArenaData): Required<ArenaPartSpec>[] {
  if (arena.stage) {
    const stage = stageById(arena.stage);
    const paths: string[] = [];
    for (const field of PIECE_FIELDS) {
      // A piece the arena does not name falls back to the stage's default, so
      // a file that only sets `stage` still renders as a complete arena.
      const glb = arena[field] || defaultPiece(arena.stage, field);
      if (glb) paths.push(glb);
    }
    // The stage loads last, matching the order the old arenaParts lists used.
    if (stage?.glb) paths.push(stage.glb);
    return paths.map((glb) => ({
      glb,
      position: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
    }));
  }

  const normalise = (
    part: string | ArenaPartSpec
  ): Required<ArenaPartSpec> | null => {
    if (typeof part === "string") {
      return part ? { glb: part, position: [0, 0, 0], rotation: [0, 0, 0] } : null;
    }
    if (!part?.glb) return null;
    return {
      glb: part.glb,
      position: part.position ?? [0, 0, 0],
      rotation: part.rotation ?? [0, 0, 0],
    };
  };

  if (Array.isArray(arena.arenaParts)) {
    return arena.arenaParts
      .map(normalise)
      .filter((p): p is Required<ArenaPartSpec> => p !== null);
  }

  if (arena.arenaGlb) {
    return [{ glb: arena.arenaGlb, position: [0, 0, 0], rotation: [0, 0, 0] }];
  }

  return [];
}
