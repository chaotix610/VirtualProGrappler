/**
 * What an arena's materials can be dressed with, and where the art for each
 * comes from.
 *
 * This registry is the whole editable surface. A material that is not named
 * here cannot be changed from the editor - which is deliberate, and is most of
 * the point. The stage GLBs carry ~30 materials between them (curtains,
 * screens, brick walls, trusses); those are authored in Blender and baked into
 * the file, so an arena picks a stage rather than dressing its parts. Only the
 * pieces that genuinely vary between arenas get a slot.
 *
 * Each slot pairs a texture picker with the colour overlays that tint the same
 * materials, so "Canvas" is one row in the UI rather than a texture field and a
 * `canvasColor` field at opposite ends of a list. Some slots are colour-only
 * (the ring steps, the turnbuckle bolt covers): their texture is renderer-owned
 * and there is nothing to choose, but the tint still varies per arena.
 *
 * `folders` is what makes the pickers short. Rather than offering all ~190
 * bundled images for every field, a slot lists the directories whose art
 * actually belongs on it, and the editor shows only those.
 */

/** Which of an arena file's two texture maps a slot is written into. */
export type SlotMap = "arenaTextures" | "ringTextures";

/** A colour overlay: a `*Color` key and the materials it tints. */
export interface ColorControl {
  /** The key written to the arena file. */
  key: string;
  /** Shown only when a slot has more than one colour, as the ropes do. */
  label?: string;
  /** Materials this colour paints. */
  materials: string[];
}

export interface TextureSlot {
  id: string;
  label: string;
  map: SlotMap;
  /** Heading this slot appears under in the editor. */
  section: string;
  /**
   * Materials the chosen texture is written to.
   *
   * More than one where a single choice dresses several materials - the three
   * ropes share one texture - and empty on a colour-only slot.
   */
  materials: string[];
  /** Directories offering art, relative to the repository root. */
  folders: string[];
  colors: ColorControl[];
}

/**
 * Work-in-progress art lives in a `_wip` subfolder of its slot.
 *
 * Upscaler output and half-finished passes sit next to the art they feed, and
 * an arena should not be able to select them by accident, so the folder listing
 * stops at the first path segment.
 */
const WIP_SEGMENT = "_wip";

const RING_SLOTS: TextureSlot[] = [
  {
    id: "canvas",
    label: "Canvas",
    map: "ringTextures",
    section: "Ring",
    materials: ["mat_canvas"],
    folders: ["assets/textures/ring/canvas"],
    colors: [{ key: "canvasColor", materials: ["mat_canvas"] }],
  },
  {
    id: "apron",
    label: "Apron",
    map: "ringTextures",
    section: "Ring",
    materials: ["mat_apron"],
    folders: ["assets/textures/ring/apron"],
    colors: [{ key: "apronColor", materials: ["mat_apron"] }],
  },
  {
    id: "post",
    label: "Post",
    map: "ringTextures",
    section: "Ring",
    materials: ["mat_post"],
    folders: ["assets/textures/ring/post"],
    colors: [{ key: "postColor", materials: ["mat_post"] }],
  },
  {
    // One texture across all three ropes - every arena has always set them to
    // the same art - but a colour each, which is what actually distinguishes
    // one promotion's ropes from another's.
    id: "ropes",
    label: "Ropes",
    map: "ringTextures",
    section: "Ring",
    materials: ["mat_rope_top", "mat_rope_middle", "mat_rope_bottom"],
    folders: ["assets/textures/ring/rope"],
    colors: [
      { key: "ropeTopColor", label: "Top", materials: ["mat_rope_top"] },
      { key: "ropeMiddleColor", label: "Middle", materials: ["mat_rope_middle"] },
      { key: "ropeBottomColor", label: "Bottom", materials: ["mat_rope_bottom"] },
    ],
  },
  {
    id: "turnbuckle",
    label: "Turnbuckle pad",
    map: "ringTextures",
    section: "Ring",
    materials: ["mat_turnbuckle"],
    folders: ["assets/textures/ring/turnbuckle"],
    colors: [{ key: "turnbucklePadColor", materials: ["mat_turnbuckle"] }],
  },
  {
    // Colour only. The bolts and their covers keep the art pinned by
    // DEFAULT_RING_TEXTURES in ArenaScene - it is hardware, the same on every
    // ring - and only the cover's tint is worth varying.
    id: "turnbuckle_bolt_cover",
    label: "Turnbuckle bolt cover",
    map: "ringTextures",
    section: "Ring",
    materials: [],
    folders: [],
    colors: [
      {
        key: "turnbuckleBoltCoverColor",
        materials: ["mat_turnbuckle_bolt_cover"],
      },
    ],
  },
  {
    // Colour only: every arena loads the same steps with the same art, so
    // there is nothing to pick, but they are tinted to match the ring.
    id: "ring_steps",
    label: "Ring steps",
    map: "ringTextures",
    section: "Ring",
    materials: [],
    folders: [],
    colors: [{ key: "ringStepsColor", materials: ["mat_ring_steps"] }],
  },
];

const ARENA_SLOTS: TextureSlot[] = [
  {
    id: "floor_ringside",
    label: "Ringside mats",
    map: "arenaTextures",
    section: "Ringside",
    materials: ["mat_floor_ringside"],
    folders: ["assets/textures/arena/floor_ringside"],
    colors: [
      { key: "floorRingsideColor", materials: ["mat_floor_ringside"] },
    ],
  },
  {
    // Offers the mat art as well as its own: the barricade skirt is dressed
    // with the same floor matting in every arena currently shipped.
    id: "barricade",
    label: "Barricade",
    map: "arenaTextures",
    section: "Ringside",
    materials: ["mat_ringside_barricade"],
    folders: [
      "assets/textures/arena/barricade",
      "assets/textures/arena/floor_ringside",
    ],
    colors: [{ key: "barricadeColor", materials: ["mat_ringside_barricade"] }],
  },
  {
    // No colour overlay: a banner is artwork, and tinting it would only muddy
    // the logo it exists to show.
    id: "ceiling_banners",
    label: "Ceiling banners",
    map: "arenaTextures",
    section: "Ceiling",
    materials: ["mat_ceiling_banners"],
    folders: ["assets/textures/arena/ceiling_banners"],
    colors: [],
  },
];

/** Every slot, in the order the editor shows them. */
export const TEXTURE_SLOTS: TextureSlot[] = [...ARENA_SLOTS, ...RING_SLOTS];

/**
 * Colour keys the renderer still honours but the editor no longer offers.
 *
 * `ropeColor` set all three ropes at once. The per-rope keys say the same
 * thing and more, so drafts expand it on the way in; this keeps a hand-written
 * or older file rendering correctly in the meantime.
 */
export const LEGACY_COLOR_TARGETS: Record<string, string[]> = {
  ropeColor: ["mat_rope_top", "mat_rope_middle", "mat_rope_bottom"],
};

const slotsById = new Map(TEXTURE_SLOTS.map((slot) => [slot.id, slot]));

export function slotById(id: string): TextureSlot | null {
  return slotsById.get(id) ?? null;
}

/** Slots belonging to one of the arena file's texture maps. */
export function slotsForMap(map: SlotMap): TextureSlot[] {
  return TEXTURE_SLOTS.filter((slot) => slot.map === map);
}

/** Slots grouped under their heading, for the editor's panel. */
export function slotSections(): { title: string; slots: TextureSlot[] }[] {
  const sections: { title: string; slots: TextureSlot[] }[] = [];
  for (const slot of TEXTURE_SLOTS) {
    const last = sections[sections.length - 1];
    if (last?.title === slot.section) last.slots.push(slot);
    else sections.push({ title: slot.section, slots: [slot] });
  }
  return sections;
}

/**
 * Which materials a `*Color` key paints.
 *
 * Replaces the hardcoded switch the renderer used to carry: the registry
 * already knows which materials a colour belongs to, so adding a slot adds its
 * colour without touching the renderer.
 */
export function colorTargets(key: string): string[] {
  for (const slot of TEXTURE_SLOTS) {
    for (const color of slot.colors) {
      if (color.key === key) return color.materials;
    }
  }
  return LEGACY_COLOR_TARGETS[key] ?? [];
}

/** Every `*Color` key the editor or renderer recognises. */
export function knownColorKeys(): string[] {
  const keys = TEXTURE_SLOTS.flatMap((slot) => slot.colors.map((c) => c.key));
  return [...keys, ...Object.keys(LEGACY_COLOR_TARGETS)];
}

/** Every material name that has a texture picker. */
export function texturedMaterials(): string[] {
  return TEXTURE_SLOTS.flatMap((slot) => slot.materials);
}

/** Whether a path sits directly in one of a slot's folders, ignoring `_wip`. */
export function pathBelongsToSlot(slot: TextureSlot, path: string): boolean {
  return slot.folders.some((folder) => {
    if (!path.startsWith(`${folder}/`)) return false;
    const rest = path.slice(folder.length + 1);
    return !rest.split("/").includes(WIP_SEGMENT);
  });
}
