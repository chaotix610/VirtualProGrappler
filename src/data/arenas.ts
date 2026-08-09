import { resolveAsset } from "./assets";

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
export type MaterialOverrides = Record<string, string>;

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
  /** Legacy single-GLB field, superseded by arenaParts. */
  arenaGlb?: string;
  arenaParts?: (string | ArenaPartSpec)[];
  arenaOverrides?: MaterialOverrides;
  ringOverrides?: MaterialOverrides;
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

/** Every arena, ordered by display name. */
export function availableArenas(): ArenaSummary[] {
  return [...byId.values()]
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

/**
 * The GLB parts of an arena, in a single shape.
 *
 * Entries may be written as a bare path or as an object with a placement, and
 * the older `arenaGlb` field is still accepted, so this collapses all three
 * into one list.
 */
export function arenaParts(arena: ArenaData): Required<ArenaPartSpec>[] {
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
