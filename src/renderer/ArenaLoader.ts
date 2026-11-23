import {
  AbstractMesh,
  ImportMeshAsync,
  Material,
  PBRMaterial,
  Quaternion,
  Scene,
  StandardMaterial,
  Texture,
  Vector3,
} from "@babylonjs/core";
// Side-effect import: registers the glTF/GLB loader with the SceneLoader.
import "@babylonjs/loaders/glTF";

import { RING } from "../game/config";
import { resolveAsset } from "../data/assets";
import { ArenaData, arenaParts } from "../data/arenas";
import { colorTargets } from "../data/textureSlots";
import { cssColorToRgb } from "./cssColor";

/**
 * Builds one arena into a scene: the ring, two sets of steps, whatever
 * environment the arena file lists, and the ceiling, with the arena's textures
 * and colours applied.
 *
 * Scene-agnostic on purpose. The Arena Viewer owns an orbiting camera around
 * this, and Combat System Test plays a match inside it; both need the
 * arena to look the same, so the building lives here rather than in either.
 */

/** The ring is served from publicDir; resolveAsset maps it to its URL. */
const RING_PATH = `assets/runtime/${RING.file}`;

const RING_STEPS_PATH = "assets/glb/arena/ring-steps.glb";

/**
 * Trusses, lights and hanging banners over the ring.
 *
 * Added by the renderer rather than listed per arena, on the same footing as
 * the ring steps: every arena has a ceiling, so there is nothing for an arena
 * file to decide beyond how it is dressed. The GLB is authored in place -
 * centred on the ring, spanning about +-11.8 units and sitting 9.3 to 13.3
 * units up - so it loads with no placement of its own.
 *
 * Its textures are packed into the file, so it renders correctly untouched.
 * An arena that wants its own banners names `mat_ceiling_banners` in
 * `arenaTextures`; `mat_ceiling_lights` and `mat_ceiling_truss` are reachable
 * the same way.
 */
const CEILING_TRUSSES_PATH = "assets/glb/arena/ceiling_trusses.glb";

/**
 * The steps GLB ships with a 1x1 placeholder baked into `mat_ring_steps`, so
 * on its own it renders flat white. The real 512x256 art sits beside it in the
 * texture tree, unreferenced by any arena file - because the steps are added
 * by this renderer rather than listed in arena data, there is nowhere in the
 * data for it to be named.
 *
 * Applied before the arena's own textures, so a future arena file that names
 * `mat_ring_steps` still wins.
 */
const DEFAULT_STEPS_TEXTURE = "assets/textures/arena/ring_steps.png";

const DEFAULT_RING_TEXTURES: Record<string, string> = {
  mat_turnbuckle_bolt_1: "assets/textures/ring/shared/turnbuckle-bolt-1.png",
  mat_turnbuckle_bolt_2: "assets/textures/ring/shared/turnbuckle-bolt-2.png",
  mat_turnbuckle_bolt_cover: "assets/textures/ring/shared/turnbuckle-bolt-cover.png",
};

/**
 * Where the two sets of steps sit, measured from the authored ring.
 *
 * These rotations are quaternions, ordered [x, y, z, w] - a different
 * convention from the Euler triples an arena file uses for `arenaParts`.
 */
const RING_STEPS_PLACEMENTS: {
  corner: string;
  position: [number, number, number];
  quaternion: [number, number, number, number];
}[] = [
  {
    corner: "ne",
    position: [3.7936058044433594, 0.675000011920929, -3.80749249458313],
    quaternion: [
      0.27059805393218994, 0.6532813310623169, -0.6532816290855408,
      0.2705979645252228,
    ],
  },
  {
    corner: "sw",
    position: [-3.5595788955688477, 0.675000011920929, 3.2128915786743164],
    quaternion: [
      0.6532816290855408, -0.27059799432754517, 0.2705981135368347,
      0.6532813310623169,
    ],
  },
];

/** Every mesh one arena load produced, grouped by where it came from. */
export interface LoadedArena {
  ring: AbstractMesh[];
  steps: AbstractMesh[];
  arena: AbstractMesh[];
  ceiling: AbstractMesh[];
  /** Anything that went wrong but did not stop the arena rendering. */
  warnings: string[];
}

/**
 * Loads an arena into `scene`.
 *
 * A missing environment part warns and carries on, since an arena is still
 * worth looking at without its floor. A missing ring throws: there would be
 * nothing left to show, and nothing to wrestle in.
 */
export async function loadArena(
  scene: Scene,
  arena: ArenaData
): Promise<LoadedArena> {
  const warnings: string[] = [];
  const loaded: LoadedArena = {
    ring: [],
    steps: [],
    arena: [],
    ceiling: [],
    warnings,
  };

  const ringUrl = resolveAsset(RING_PATH);
  if (!ringUrl) throw new Error(`Ring model is missing: ${RING_PATH}`);
  loaded.ring = (await ImportMeshAsync(ringUrl, scene)).meshes;

  const stepsUrl = resolveAsset(RING_STEPS_PATH);
  if (stepsUrl) {
    for (const placement of RING_STEPS_PLACEMENTS) {
      const meshes = (await ImportMeshAsync(stepsUrl, scene)).meshes;
      placeSteps(meshes, placement);
      loaded.steps.push(...meshes);
    }
    applyDefaultStepsTexture(scene, loaded.steps);
  } else {
    warnings.push(`Ring steps not bundled: ${RING_STEPS_PATH}`);
  }

  for (const part of arenaParts(arena)) {
    const url = resolveAsset(part.glb);
    if (!url) {
      warnings.push(`Arena part not bundled: ${part.glb}`);
      continue;
    }
    const meshes = (await ImportMeshAsync(url, scene)).meshes;
    placePart(meshes, part.position, part.rotation);
    loaded.arena.push(...meshes);
  }

  const ceilingUrl = resolveAsset(CEILING_TRUSSES_PATH);
  if (ceilingUrl) {
    loaded.ceiling = (await ImportMeshAsync(ceilingUrl, scene)).meshes;
  } else {
    warnings.push(`Ceiling trusses not bundled: ${CEILING_TRUSSES_PATH}`);
  }

  warnings.push(...applyTextures(scene, arena, loaded));
  return loaded;
}

/** Every mesh in a load, in one list. */
export function allArenaMeshes(loaded: LoadedArena): AbstractMesh[] {
  return [...loaded.ring, ...loaded.steps, ...loaded.arena, ...loaded.ceiling];
}

/** Disposes a load's meshes, and each shared material once. */
export function disposeArena(loaded: LoadedArena): void {
  const materials = new Set<Material>();
  for (const mesh of allArenaMeshes(loaded)) {
    // Meshes share materials - the ring has ~69 meshes over 10 materials -
    // so they are collected and disposed once rather than per mesh.
    if (mesh.material) materials.add(mesh.material);
    mesh.dispose();
  }
  for (const material of materials) material.dispose();
}

function placeSteps(
  meshes: AbstractMesh[],
  placement: (typeof RING_STEPS_PLACEMENTS)[number]
): void {
  const target = meshes.find((m) => m.name === "ring-steps") ?? meshes[0];
  if (!target) return;
  target.position.set(...placement.position);
  target.rotationQuaternion = new Quaternion(...placement.quaternion);
}

function placePart(
  meshes: AbstractMesh[],
  position: [number, number, number],
  rotation: [number, number, number]
): void {
  const offset = new Vector3(...position);
  const euler = new Vector3(...rotation);
  const hasOffset = offset.lengthSquared() > 0;
  const hasRotation = euler.lengthSquared() > 0;
  if (!hasOffset && !hasRotation) return;

  for (const mesh of meshes) {
    // Only roots move; children follow their parent.
    if (mesh.parent) continue;

    if (hasRotation) {
      const spin = Quaternion.RotationYawPitchRoll(euler.y, euler.x, euler.z);
      mesh.rotationQuaternion = mesh.rotationQuaternion
        ? spin.multiply(mesh.rotationQuaternion)
        : spin;
    }
    if (hasOffset) mesh.position.addInPlace(offset);
  }
}

/** Replaces the steps' 1x1 placeholder with the real art. */
function applyDefaultStepsTexture(scene: Scene, steps: AbstractMesh[]): void {
  const materials = new Set<Material>();
  for (const mesh of steps) {
    if (mesh.material?.name === "mat_ring_steps") {
      materials.add(mesh.material);
    }
  }

  for (const material of materials) {
    swapTexture(scene, material, DEFAULT_STEPS_TEXTURE);
  }
}

function applyTextures(
  scene: Scene,
  arena: ArenaData,
  loaded: LoadedArena
): string[] {
  const warnings: string[] = [];
  const ringTextures = { ...arena.ringTextures };
  for (const [name, path] of Object.entries(DEFAULT_RING_TEXTURES)) {
    ringTextures[name] ??= path;
  }
  warnings.push(
    ...applyTo(
      scene,
      [...loaded.ring, ...loaded.steps],
      ringTextures,
      "ringTextures"
    )
  );
  warnings.push(
    ...applyTo(
      scene,
      [...loaded.arena, ...loaded.ceiling],
      arena.arenaTextures,
      "arenaTextures"
    )
  );
  return warnings;
}

function applyTo(
  scene: Scene,
  meshes: AbstractMesh[],
  textures: Record<string, string> | undefined,
  label: string
): string[] {
  if (!textures) return [];

  const byName = new Map<string, Set<Material>>();
  for (const mesh of meshes) {
    if (!mesh.material?.name) continue;
    const materials = byName.get(mesh.material.name) ?? new Set<Material>();
    materials.add(mesh.material);
    byName.set(mesh.material.name, materials);
  }

  const warnings: string[] = [];
  for (const [key, value] of Object.entries(textures)) {
    if (key.endsWith("Color")) {
      applyColor(byName, key, value);
      continue;
    }
    const materials = byName.get(key);
    if (!materials?.size) {
      warnings.push(`${label}: no material named "${key}"`);
      continue;
    }
    for (const material of materials) swapTexture(scene, material, value);
  }
  return warnings;
}

function applyColor(
  byName: Map<string, Set<Material>>,
  key: string,
  cssColor: string
): void {
  const rgb = cssColorToRgb(cssColor);
  if (!rgb) return;

  // The slot registry owns the key -> material mapping, so a new colour
  // control works here without the renderer being told about it.
  for (const name of colorTargets(key)) {
    const materials = byName.get(name);
    if (!materials) continue;
    for (const material of materials) {
      if (material instanceof PBRMaterial) {
        material.albedoColor.set(rgb.r, rgb.g, rgb.b);
      } else if (material instanceof StandardMaterial) {
        material.diffuseColor.set(rgb.r, rgb.g, rgb.b);
      }
    }
  }
}

function swapTexture(scene: Scene, material: Material, texturePath: string): void {
  const url = resolveAsset(texturePath);
  if (!url) return;

  // invertY false matches the glTF UV convention; without it every swapped
  // texture appears upside down against the baked ones.
  const texture = new Texture(url, scene, undefined, false);

  // GLB materials import as PBRMaterial, so that is the branch that fires
  // for the ring and floor. StandardMaterial covers anything built in code.
  if (material instanceof PBRMaterial) {
    material.albedoTexture = texture;
  } else if (material instanceof StandardMaterial) {
    material.diffuseTexture = texture;
  }
}
