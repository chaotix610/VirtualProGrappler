/**
 * The rings an arena can use, loaded from data/environments/rings.json.
 *
 * A ring is more than its GLB. The steps are a separate model placed against
 * the ring's corners, so each ring carries its own placements; and the
 * original ring ships placeholder bolt materials, so it also names the art the
 * renderer lays under them. A ring whose GLB embeds every texture it needs
 * names none, and its parts keep their baked textures unless an arena file
 * says otherwise.
 *
 * Imported rather than fetched, so Vite tracks data changes and includes the
 * definitions in production builds.
 */

import ringsFile from "../../data/environments/rings.json";

/** Where one set of steps sits, in the steps GLB's own (glTF) frame. */
export interface StepsPlacement {
  corner: string;
  position: [number, number, number];
  /** Ordered [x, y, z, w]. */
  quaternion: [number, number, number, number];
}

export interface RingData {
  id: string;
  displayName: string;
  glb: string;
  /** Art for materials the GLB ships without, applied under the arena's own. */
  defaultTextures?: Record<string, string>;
  steps: StepsPlacement[];
}

// Through `unknown` because JSON imports type the placements as number[], not
// the fixed-length tuples Babylon takes; rings.schema.json enforces the lengths.
const rings: RingData[] = (ringsFile as unknown as { rings: RingData[] }).rings;
const byGlb = new Map(rings.map((ring) => [ring.glb, ring]));

/** Every ring, in the order the file lists them. */
export function availableRings(): RingData[] {
  return rings;
}

/** The ring an arena gets when it names none - the first one listed. */
export function defaultRing(): RingData {
  return rings[0];
}

export function ringByGlb(glb: string): RingData | null {
  return byGlb.get(glb) ?? null;
}

/**
 * The ring an arena file's `ring` field selects.
 *
 * Blank or unknown values fall back to the default ring rather than failing:
 * the ring is the one part an arena cannot render without, so a typo should
 * cost the look of the ring, not the whole arena.
 */
export function resolveRing(glb: string | undefined): RingData {
  return (glb && byGlb.get(glb)) || defaultRing();
}
