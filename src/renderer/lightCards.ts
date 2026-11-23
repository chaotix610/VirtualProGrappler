/**
 * Light cards: flat planes in the stage and ceiling GLBs that stand in for
 * light - truss flares, lamp glows, entrance haze, beams down to the ring.
 *
 * glTF can say neither "face the camera" nor "add your light to what is behind
 * you", so the mesh names carry it, and the loader reads them here. Kept free
 * of Babylon so the naming rules can be tested on their own. Every kind blends
 * additively; ArenaLoader applies the rest.
 */

export interface LightCardKind {
  /** Turns to face the camera. */
  billboard: boolean;
  /** Pulses in size and brightness. */
  twinkle: boolean;
  /** Bleeds light into its surroundings through the bloom layer. */
  bloom: boolean;
}

const LIGHT_CARDS: Record<string, LightCardKind> = {
  /** Star glints on a stage truss. */
  flare_: { billboard: true, twinkle: true, bloom: true },
  /** Steady glows on the ceiling lamp lenses. */
  glow_: { billboard: true, twinkle: false, bloom: true },
  /** Glow filling a stage entranceway. Too big to bloom without fogging it. */
  haze_: { billboard: false, twinkle: false, bloom: false },
  /** Shafts from the ceiling lamps down to the ring. */
  beam_: { billboard: false, twinkle: false, bloom: false },
};

/** What a mesh of this name does as light, or null when it is solid. */
export function lightCardKind(meshName: string): LightCardKind | null {
  for (const [prefix, kind] of Object.entries(LIGHT_CARDS)) {
    if (meshName.startsWith(prefix)) return kind;
  }
  return null;
}
