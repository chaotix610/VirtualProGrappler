import {
  AbstractMesh,
  Constants,
  GlowLayer,
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

import { resolveAsset } from "../data/assets";
import { ArenaData, arenaParts } from "../data/arenas";
import { RingData, StepsPlacement, resolveRing } from "../data/rings";
import { colorBlend, colorTargets, texturedMaterials } from "../data/textureSlots";
import { applyColorOverlay } from "./colorOverlay";
import { cssColorToRgba } from "./cssColor";
import { lightCardKind } from "./lightCards";

/**
 * Builds one arena into a scene: the ring, two sets of steps, whatever
 * environment the arena file lists, and the ceiling, with the arena's textures
 * and colours applied.
 *
 * Scene-agnostic on purpose. The Arena Viewer owns an orbiting camera around
 * this, and Combat System Test plays a match inside it; both need the
 * arena to look the same, so the building lives here rather than in either.
 */

const RING_STEPS_PATH = "assets/environments/arenas/shared/ring/models/ring-steps.glb";

/**
 * Materials an arena file may name that the loaded models can lack.
 *
 * The ring, floor and barricade are all interchangeable now, and they do not
 * share material names: RAW dresses the padded barricade's skirt, which the
 * metal barricade does not have, and ring-standard-2 calls its pads `mat_pad`
 * where the original ring says `mat_turnbuckle`. A name the editor knows is
 * therefore only absent, not wrong; a name nothing knows is still reported.
 */
const OPTIONAL_MATERIALS = new Set(texturedMaterials());

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
 *
 * This is the lit copy of `ceiling_trusses.glb`: the same trusses plus a
 * `glow_*` card on each of the 44 lamp lenses and a `beam_*` shaft from each
 * lamp card down to the ring. The glows sit on the lenses painted into
 * `mat_ceiling_lights`, so an arena that swaps that texture for one with the
 * lamps elsewhere would leave them floating.
 */
const CEILING_TRUSSES_PATH = "assets/environments/arenas/shared/models/ceiling_trusses_lit.glb";

/** The scene's one bloom layer, shared by every arena loaded into it. */
const BLOOM_LAYER = "lightCardBloom";

/** True for a light card, which is light rather than something solid. */
export function isLightCard(mesh: AbstractMesh): boolean {
  return lightCardKind(mesh.name) !== null;
}

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
const DEFAULT_STEPS_TEXTURE = "assets/environments/arenas/shared/textures/ring_steps.png";

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

  // The ring comes from the arena file; one that names none, or names a ring
  // the registry does not know, gets the default.
  const ring = resolveRing(arena.ring);
  const ringUrl = resolveAsset(ring.glb);
  if (!ringUrl) throw new Error(`Ring model is missing: ${ring.glb}`);
  loaded.ring = (await ImportMeshAsync(ringUrl, scene)).meshes;

  const stepsUrl = resolveAsset(RING_STEPS_PATH);
  if (stepsUrl) {
    // Placements belong to the ring: the steps meet its corners, which are
    // not in the same place on every ring.
    for (const placement of ring.steps) {
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
    // Placed before the light cards are set up: billboards are detached from
    // their parent, so they have to inherit its final placement first.
    placePart(meshes, part.position, part.rotation, part.scale);
    applyLightCards(scene, meshes);
    loaded.arena.push(...meshes);
  }

  const ceilingUrl = resolveAsset(CEILING_TRUSSES_PATH);
  if (ceilingUrl) {
    loaded.ceiling = (await ImportMeshAsync(ceilingUrl, scene)).meshes;
    applyLightCards(scene, loaded.ceiling);
  } else {
    warnings.push(`Ceiling trusses not bundled: ${CEILING_TRUSSES_PATH}`);
  }

  warnings.push(...applyTextures(scene, arena, ring, loaded));
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

function placeSteps(meshes: AbstractMesh[], placement: StepsPlacement): void {
  const target = meshes.find((m) => m.name === "ring-steps") ?? meshes[0];
  if (!target) return;
  target.position.set(...placement.position);
  target.rotationQuaternion = new Quaternion(...placement.quaternion);
}

function placePart(
  meshes: AbstractMesh[],
  position: [number, number, number],
  rotation: [number, number, number],
  scale = 1
): void {
  const offset = new Vector3(...position);
  const euler = new Vector3(...rotation);
  const hasOffset = offset.lengthSquared() > 0;
  const hasRotation = euler.lengthSquared() > 0;
  const hasScale = scale !== 1;
  if (!hasOffset && !hasRotation && !hasScale) return;

  for (const mesh of meshes) {
    // Only roots move; children follow their parent.
    if (mesh.parent) continue;

    // Multiplied in rather than set: the glTF root already carries a -1 on
    // one axis to change handedness, and that has to survive.
    if (hasScale) mesh.scaling.scaleInPlace(scale);

    if (hasRotation) {
      const spin = Quaternion.RotationYawPitchRoll(euler.y, euler.x, euler.z);
      mesh.rotationQuaternion = mesh.rotationQuaternion
        ? spin.multiply(mesh.rotationQuaternion)
        : spin;
    }
    if (hasOffset) mesh.position.addInPlace(offset);
  }
}

/**
 * Turns a GLB's light cards into light: additive, unpickable, and - for the
 * kinds that ask - facing the camera, twinkling and blooming.
 */
function applyLightCards(scene: Scene, meshes: AbstractMesh[]): void {
  const cards = meshes.filter((mesh) => lightCardKind(mesh.name));
  if (!cards.length) return;

  // Billboards are detached below, keeping the world placement they have at
  // that moment. Nothing has rendered yet, so the cached matrices may predate
  // placePart moving the root; recomputing every root's tree top-down first
  // means a scaled, turned stage hands its cards the placement it really has.
  for (const root of meshes.filter((mesh) => !mesh.parent)) {
    root.computeWorldMatrix(true);
    for (const node of root.getDescendants(false)) node.computeWorldMatrix(true);
  }

  const twinkling: AbstractMesh[] = [];
  for (const mesh of cards) {
    const kind = lightCardKind(mesh.name)!;
    mesh.isPickable = false;

    // Shared by every card of one colour, so this repeats harmlessly.
    const material = mesh.material;
    if (material) {
      material.alphaMode = Constants.ALPHA_ADD;
      material.disableDepthWrite = true;
      material.backFaceCulling = false;
    }

    if (kind.billboard) {
      // The glTF root mirrors Z to change handedness, and Babylon's billboard
      // maths mishandles a mirrored parent - every card lands upside down
      // below the floor. Detaching first keeps the world position it has now.
      // It must happen before billboarding, which would bake in that error.
      mesh.setParent(null);
      mesh.billboardMode = AbstractMesh.BILLBOARDMODE_ALL;
    }
    if (kind.twinkle) twinkling.push(mesh);
  }
  if (twinkling.length) twinkle(scene, twinkling);
  ensureBloom(scene);
}

/**
 * Adds the bloom layer the first time any arena loads into `scene`.
 *
 * Every mesh renders into it - the rest in black, so a truss in front of a
 * lamp still hides its glow - but only cards whose kind blooms give off
 * light. Unlit cards keep their colour in the albedo texture rather than an
 * emissive one, so the layer is pointed there.
 */
function ensureBloom(scene: Scene): void {
  if (scene.getGlowLayerByName(BLOOM_LAYER)) return;

  const bloom = new GlowLayer(BLOOM_LAYER, scene, { blurKernelSize: 32 });
  bloom.intensity = 0.8;
  const blooms = (mesh: AbstractMesh) => lightCardKind(mesh.name)?.bloom === true;
  // Typed as always returning a texture, but Babylon reads null as "none".
  bloom.customEmissiveTextureSelector = (mesh, _subMesh, material) =>
    (blooms(mesh) && material instanceof PBRMaterial
      ? material.albedoTexture
      : null) as Texture;
  bloom.customEmissiveColorSelector = (mesh, _subMesh, _material, result) => {
    if (blooms(mesh)) result.set(1, 1, 1, 1);
    else result.set(0, 0, 0, 0);
  };
}

/**
 * Pulses each flare's size and brightness on its own rate and phase, so the
 * truss sparkles rather than breathing in unison.
 */
function twinkle(scene: Scene, flares: AbstractMesh[]): void {
  const pulses = flares.map((mesh) => ({
    mesh,
    base: mesh.scaling.clone(),
    rate: 1.5 + Math.random() * 2.5,
    phase: Math.random() * Math.PI * 2,
  }));

  let seconds = 0;
  const observer = scene.onBeforeRenderObservable.add(() => {
    seconds += scene.getEngine().getDeltaTime() / 1000;
    for (const pulse of pulses) {
      const wave = Math.sin(seconds * pulse.rate + pulse.phase);
      pulse.mesh.scaling.copyFrom(pulse.base).scaleInPlace(0.85 + 0.15 * wave);
      pulse.mesh.visibility = 0.9 + 0.1 * wave;
    }
  });

  // An arena is torn down by disposing its meshes, so the pulse goes with them.
  flares[0].onDisposeObservable.addOnce(() => {
    scene.onBeforeRenderObservable.remove(observer);
  });
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
  ring: RingData,
  loaded: LoadedArena
): string[] {
  const warnings: string[] = [];
  // The ring's own defaults go under the arena's choices. A ring that embeds
  // all its art lists none, so anything the arena leaves unset keeps the
  // texture baked into the GLB.
  const ringTextures = { ...arena.ringTextures };
  for (const [name, path] of Object.entries(ring.defaultTextures ?? {})) {
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
      if (!OPTIONAL_MATERIALS.has(key)) {
        warnings.push(`${label}: no material named "${key}"`);
      }
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
  const rgba = cssColorToRgba(cssColor);
  if (!rgba) return;
  const rgb = { r: rgba.r, g: rgba.g, b: rgba.b };
  const overlay = colorBlend(key) === "overlay";

  // The slot registry owns the key -> material mapping, so a new colour
  // control works here without the renderer being told about it.
  for (const name of colorTargets(key)) {
    const materials = byName.get(name);
    if (!materials) continue;
    for (const material of materials) {
      if (overlay) {
        applyColorOverlay(material, rgba);
      } else if (material instanceof PBRMaterial) {
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
