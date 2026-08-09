import {
  AbstractMesh,
  ArcRotateCamera,
  Color4,
  Engine,
  HemisphericLight,
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
import { ArenaData, arenaById, arenaParts } from "../data/arenas";
import { cssColorToRgb } from "./cssColor";

/**
 * Renders one arena for the Arena Viewer: the ring, two sets of steps, and
 * whatever environment the arena file lists, with its material overrides
 * applied.
 *
 * Deliberately does *not* use RingRopes. Rope elasticity is a gameplay system
 * driven by the character controller; a viewer only needs to look at the ring,
 * and the GLB's own static rope meshes are the right thing to show.
 */

/** The ring is served from publicDir; resolveAsset maps it to its URL. */
const RING_PATH = `assets/runtime/${RING.file}`;

const RING_STEPS_PATH = "assets/glb/arena/ring-steps.glb";

/**
 * The steps GLB ships with a 1x1 placeholder baked into `mat_ring_steps`, so
 * on its own it renders flat white. The real 512x256 art sits beside it in the
 * texture tree, unreferenced by any arena file - because the steps are added
 * by this renderer rather than listed in arena data, there is nowhere in the
 * data for it to be named.
 *
 * Applied before the arena's own overrides, so a future arena file that names
 * `mat_ring_steps` still wins.
 */
const DEFAULT_STEPS_TEXTURE = "assets/textures/arena/ring_steps.png";

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

export interface ArenaBounds {
  min: Vector3;
  max: Vector3;
  center: Vector3;
  size: Vector3;
}

/** Anything that went wrong but did not stop the arena rendering. */
export interface ArenaLoadReport {
  warnings: string[];
}

export class ArenaScene {
  private engine: Engine | null = null;
  private scene: Scene | null = null;
  private camera: ArcRotateCamera | null = null;

  private ringMeshes: AbstractMesh[] = [];
  private stepsMeshes: AbstractMesh[] = [];
  private arenaMeshes: AbstractMesh[] = [];

  constructor(private readonly canvas: HTMLCanvasElement) {}

  // --- lifecycle -----------------------------------------------------------

  private init(): void {
    if (this.engine) return;

    this.engine = new Engine(this.canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });

    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.05, 0.05, 0.08, 1);

    this.camera = new ArcRotateCamera(
      "arenaCamera",
      -Math.PI / 2,
      Math.PI / 2.6,
      18,
      Vector3.Zero(),
      this.scene
    );
    this.camera.attachControl(this.canvas, true);
    this.camera.lowerBetaLimit = Math.PI / 6;
    this.camera.upperBetaLimit = Math.PI / 2.2;
    this.camera.lowerRadiusLimit = 8;
    this.camera.upperRadiusLimit = 30;

    const light = new HemisphericLight(
      "arenaLight",
      new Vector3(0, 1, 0),
      this.scene
    );
    light.intensity = 1.0;

    window.addEventListener("resize", this.onResize);
    this.engine.runRenderLoop(this.render);
  }

  private onResize = (): void => {
    this.engine?.resize();
  };

  private render = (): void => {
    this.scene?.render();
  };

  /** Tears down the whole viewer. Safe to call more than once. */
  dispose(): void {
    this.clearArena();
    window.removeEventListener("resize", this.onResize);
    this.engine?.stopRenderLoop();
    this.scene?.dispose();
    this.engine?.dispose();
    this.engine = null;
    this.scene = null;
    this.camera = null;
  }

  // --- loading -------------------------------------------------------------

  /**
   * Loads an arena, replacing whatever was on screen.
   *
   * A missing environment part warns and carries on, since an arena is still
   * worth looking at without its floor. A missing ring throws: there would be
   * nothing left to show.
   */
  async load(arenaId: string): Promise<ArenaLoadReport> {
    this.init();
    this.clearArena();

    const scene = this.scene!;
    const arena = arenaById(arenaId);
    if (!arena) throw new Error(`No arena data for "${arenaId}"`);

    const warnings: string[] = [];

    const ringUrl = resolveAsset(RING_PATH);
    if (!ringUrl) throw new Error(`Ring model is missing: ${RING_PATH}`);
    this.ringMeshes = (await ImportMeshAsync(ringUrl, scene)).meshes;

    const stepsUrl = resolveAsset(RING_STEPS_PATH);
    if (stepsUrl) {
      for (const placement of RING_STEPS_PLACEMENTS) {
        const meshes = (await ImportMeshAsync(stepsUrl, scene)).meshes;
        this.placeSteps(meshes, placement);
        this.stepsMeshes.push(...meshes);
      }
      this.applyDefaultStepsTexture();
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
      this.placePart(meshes, part.position, part.rotation);
      this.arenaMeshes.push(...meshes);
    }

    warnings.push(...this.applyOverrides(arena));
    this.frameCamera();

    return { warnings };
  }

  /** Removes the loaded arena but keeps the engine and camera alive. */
  private clearArena(): void {
    const materials = new Set<Material>();
    for (const mesh of [
      ...this.ringMeshes,
      ...this.stepsMeshes,
      ...this.arenaMeshes,
    ]) {
      // Meshes share materials - the ring has ~69 meshes over 10 materials -
      // so they are collected and disposed once rather than per mesh.
      if (mesh.material) materials.add(mesh.material);
      mesh.dispose();
    }
    for (const material of materials) material.dispose();

    this.ringMeshes = [];
    this.stepsMeshes = [];
    this.arenaMeshes = [];
  }

  private placeSteps(
    meshes: AbstractMesh[],
    placement: (typeof RING_STEPS_PLACEMENTS)[number]
  ): void {
    const target = meshes.find((m) => m.name === "ring-steps") ?? meshes[0];
    if (!target) return;
    target.position.set(...placement.position);
    target.rotationQuaternion = new Quaternion(...placement.quaternion);
  }

  private placePart(
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

  // --- materials -----------------------------------------------------------

  /** Replaces the steps' 1x1 placeholder with the real art. */
  private applyDefaultStepsTexture(): void {
    for (const mesh of this.stepsMeshes) {
      if (mesh.material?.name === "mat_ring_steps") {
        this.swapTexture(mesh.material, DEFAULT_STEPS_TEXTURE);
        return;
      }
    }
  }

  private applyOverrides(arena: ArenaData): string[] {
    const warnings: string[] = [];
    warnings.push(
      ...this.applyTo(this.ringMeshes, arena.ringOverrides, "ringOverrides")
    );
    warnings.push(
      ...this.applyTo(this.arenaMeshes, arena.arenaOverrides, "arenaOverrides")
    );
    return warnings;
  }

  private applyTo(
    meshes: AbstractMesh[],
    overrides: Record<string, string> | undefined,
    label: string
  ): string[] {
    if (!overrides) return [];

    const byName = new Map<string, Material>();
    for (const mesh of meshes) {
      if (mesh.material?.name) byName.set(mesh.material.name, mesh.material);
    }

    const warnings: string[] = [];
    for (const [key, value] of Object.entries(overrides)) {
      if (key.endsWith("Color")) {
        this.applyColor(byName, key, value);
        continue;
      }
      const material = byName.get(key);
      if (!material) {
        warnings.push(`${label}: no material named "${key}"`);
        continue;
      }
      this.swapTexture(material, value);
    }
    return warnings;
  }

  /** Which material each `*Color` key paints. */
  private colorTargets(key: string): string[] {
    switch (key) {
      case "canvasColor":
        return ["mat_canvas"];
      case "postColor":
        return ["mat_post"];
      case "turnbucklePadColor":
        return ["mat_turnbuckle"];
      case "ropeColor":
        return ["mat_rope_top", "mat_rope_middle", "mat_rope_bottom"];
      case "ropeTopColor":
        return ["mat_rope_top"];
      case "ropeMiddleColor":
        return ["mat_rope_middle"];
      case "ropeBottomColor":
        return ["mat_rope_bottom"];
      default:
        return [];
    }
  }

  private applyColor(
    byName: Map<string, Material>,
    key: string,
    cssColor: string
  ): void {
    const rgb = cssColorToRgb(cssColor);
    if (!rgb) return;

    for (const name of this.colorTargets(key)) {
      const material = byName.get(name);
      if (!material) continue;
      if (material instanceof PBRMaterial) {
        material.albedoColor.set(rgb.r, rgb.g, rgb.b);
      } else if (material instanceof StandardMaterial) {
        material.diffuseColor.set(rgb.r, rgb.g, rgb.b);
      }
    }
  }

  private swapTexture(material: Material, texturePath: string): void {
    const url = resolveAsset(texturePath);
    if (!url) return;

    // invertY false matches the glTF UV convention; without it every swapped
    // texture appears upside down against the baked ones.
    const texture = new Texture(url, this.scene, undefined, false);

    // GLB materials import as PBRMaterial, so that is the branch that fires
    // for the ring and floor. StandardMaterial covers anything built in code.
    if (material instanceof PBRMaterial) {
      material.albedoTexture = texture;
    } else if (material instanceof StandardMaterial) {
      material.diffuseTexture = texture;
    }
  }

  // --- camera --------------------------------------------------------------

  /** Everything currently loaded, for framing. */
  private allMeshes(): AbstractMesh[] {
    return [...this.ringMeshes, ...this.stepsMeshes, ...this.arenaMeshes];
  }

  bounds(meshes = this.ringMeshes): ArenaBounds | null {
    let min = new Vector3(Infinity, Infinity, Infinity);
    let max = new Vector3(-Infinity, -Infinity, -Infinity);
    let found = false;

    for (const mesh of meshes) {
      if (!mesh.getTotalVertices?.()) continue;
      mesh.computeWorldMatrix(true);
      const box = mesh.getBoundingInfo().boundingBox;
      min = Vector3.Minimize(min, box.minimumWorld);
      max = Vector3.Maximize(max, box.maximumWorld);
      found = true;
    }

    if (!found) return null;
    return {
      min,
      max,
      center: min.add(max).scale(0.5),
      size: max.subtract(min),
    };
  }

  /** Frames the ring if it has geometry, else whatever else loaded. */
  private frameCamera(): void {
    const camera = this.camera;
    if (!camera) return;

    const bounds = this.bounds() ?? this.bounds(this.allMeshes());
    if (!bounds) return;

    const largest = Math.max(bounds.size.x, bounds.size.y, bounds.size.z);
    const target = bounds.center.clone();
    target.y += bounds.size.y * 0.1;

    camera.setTarget(target);
    camera.radius = Math.max(largest * 1.2, 12);
    camera.lowerRadiusLimit = Math.max(largest * 0.35, 8);
    camera.upperRadiusLimit = Math.max(largest * 3, camera.radius + 10);
  }

  private static readonly ROTATION_STEP = Math.PI / 48;
  private static readonly ZOOM_STEP = 1.2;

  /** Nudges the camera. `input` is a virtual controller input. */
  moveCamera(input: string): void {
    const camera = this.camera;
    if (!camera) return;

    const step = ArenaScene.ROTATION_STEP;
    const zoom = ArenaScene.ZOOM_STEP;

    switch (input) {
      case "stickUp":
        camera.beta = clamp(camera.beta + step, camera.lowerBetaLimit, camera.upperBetaLimit);
        break;
      case "stickDown":
        camera.beta = clamp(camera.beta - step, camera.lowerBetaLimit, camera.upperBetaLimit);
        break;
      case "stickLeft":
        camera.alpha -= step;
        break;
      case "stickRight":
        camera.alpha += step;
        break;
      case "cUp":
        camera.radius = clamp(camera.radius - zoom, camera.lowerRadiusLimit, camera.upperRadiusLimit);
        break;
      case "cDown":
        camera.radius = clamp(camera.radius + zoom, camera.lowerRadiusLimit, camera.upperRadiusLimit);
        break;
    }
  }

  /** Camera state, for tests and debugging. */
  cameraState(): { alpha: number; beta: number; radius: number } | null {
    const c = this.camera;
    return c ? { alpha: c.alpha, beta: c.beta, radius: c.radius } : null;
  }

  /** How many meshes are loaded, by group. For tests. */
  meshCounts(): { ring: number; steps: number; arena: number } {
    return {
      ring: this.ringMeshes.length,
      steps: this.stepsMeshes.length,
      arena: this.arenaMeshes.length,
    };
  }
}

function clamp(value: number, lower: number | null, upper: number | null): number {
  return Math.min(Math.max(value, lower ?? -Infinity), upper ?? Infinity);
}
