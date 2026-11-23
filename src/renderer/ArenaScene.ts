import {
  AbstractMesh,
  ArcRotateCamera,
  Color4,
  Engine,
  HemisphericLight,
  Scene,
  Vector3,
} from "@babylonjs/core";

import { ArenaData, arenaById } from "../data/arenas";
import { LoadedArena, disposeArena, loadArena } from "./ArenaLoader";

/**
 * Renders one arena for the Arena Viewer: the ring, two sets of steps, and
 * whatever environment the arena file lists, with its configured textures.
 * The building itself is `loadArena`'s; this class adds the orbiting camera
 * and render loop around it.
 *
 * Deliberately does *not* use RingRopes. Rope elasticity is a gameplay system
 * driven by the character controller; a viewer only needs to look at the ring,
 * and the GLB's own static rope meshes are the right thing to show.
 */

export interface ArenaBounds {
  min: Vector3;
  max: Vector3;
  center: Vector3;
  size: Vector3;
}

/** Where the orbit camera is, in world units and radians. */
export interface CameraState {
  alpha: number;
  beta: number;
  radius: number;
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
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
  private ceilingMeshes: AbstractMesh[] = [];
  private loaded: LoadedArena | null = null;

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
    this.scene.collisionsEnabled = true;

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
    // Babylon sweeps the camera from its last position to its new one, so a
    // move into a wall slides along its surface instead of passing through.
    // Off until the first framing: the camera starts at the origin, and the
    // sweep out from there would snag on the ring.
    this.camera.checkCollisions = false;
    this.camera.collisionRadius = new Vector3(
      ArenaScene.CAMERA_CLEARANCE,
      ArenaScene.CAMERA_CLEARANCE,
      ArenaScene.CAMERA_CLEARANCE
    );

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
   * Takes either a saved arena's id or arena data directly. The editor passes
   * data, so a draft can be rendered before - or without - it ever being
   * written to disk.
   *
   * A missing environment part warns and carries on, since an arena is still
   * worth looking at without its floor. A missing ring throws: there would be
   * nothing left to show.
   */
  async load(arenaOrId: string | ArenaData): Promise<ArenaLoadReport> {
    this.init();
    this.clearArena();

    const arena =
      typeof arenaOrId === "string" ? arenaById(arenaOrId) : arenaOrId;
    if (!arena) throw new Error(`No arena data for "${arenaOrId}"`);

    const loaded = await loadArena(this.scene!, arena);
    this.loaded = loaded;
    this.ringMeshes = loaded.ring;
    this.stepsMeshes = loaded.steps;
    this.arenaMeshes = loaded.arena;
    this.ceilingMeshes = loaded.ceiling;

    // Everything loaded is solid to the camera.
    for (const mesh of this.allMeshes()) mesh.checkCollisions = true;

    this.frameCamera();

    return { warnings: loaded.warnings };
  }

  /** Removes the loaded arena but keeps the engine and camera alive. */
  private clearArena(): void {
    if (this.loaded) disposeArena(this.loaded);
    this.loaded = null;

    this.ringMeshes = [];
    this.stepsMeshes = [];
    this.arenaMeshes = [];
    this.ceilingMeshes = [];
  }

  // --- camera --------------------------------------------------------------

  /** Everything currently loaded, for framing. */
  private allMeshes(): AbstractMesh[] {
    return [
      ...this.ringMeshes,
      ...this.stepsMeshes,
      ...this.arenaMeshes,
      ...this.ceilingMeshes,
    ];
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

  /**
   * Frames the ring if it has geometry, else whatever else loaded.
   *
   * The camera jumps straight to its framed spot rather than sweeping there:
   * the sweep from wherever it was could catch on the arena on the way.
   */
  private frameCamera(): void {
    const camera = this.camera;
    if (!camera) return;

    camera.checkCollisions = false;
    this.placeCamera(camera);
    camera.getViewMatrix(true);
    camera.checkCollisions = true;
  }

  private placeCamera(camera: ArcRotateCamera): void {
    const bounds = this.bounds() ?? this.bounds(this.allMeshes());
    if (!bounds) return;

    const largest = Math.max(bounds.size.x, bounds.size.y, bounds.size.z);
    const target = bounds.center.clone();
    target.y += bounds.size.y * 0.1;

    camera.setTarget(target);
    camera.radius = Math.max(largest * 1.2, 12);
    camera.lowerRadiusLimit = Math.max(largest * 0.35, 8);

    // The opening shot stays on the ring, but the outer limit is measured
    // against everything loaded so the ceiling - roughly three times the
    // ring's span and well above it - can be pulled back into view rather
    // than sitting permanently off the top of the frame.
    const whole = this.bounds(this.allMeshes()) ?? bounds;
    const widest = Math.max(whole.size.x, whole.size.y, whole.size.z);
    camera.upperRadiusLimit = Math.max(widest * 3, camera.radius + 10);
  }

  /** How close, in world units, the camera may come to a surface. */
  private static readonly CAMERA_CLEARANCE = 0.5;
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

  /** Camera state, for tests, debugging and the viewer's position readout. */
  cameraState(): CameraState | null {
    const c = this.camera;
    if (!c) return null;
    const { x, y, z } = c.position;
    const t = c.target;
    return {
      alpha: c.alpha,
      beta: c.beta,
      radius: c.radius,
      position: { x, y, z },
      target: { x: t.x, y: t.y, z: t.z },
    };
  }

  /**
   * The material names present in the loaded scene, grouped the way the arena
   * file's texture maps are.
   *
   * The editor lists these so a texture is assigned to a material that is
   * actually there. Picking a name by hand is the one way to write a valid
   * arena file that silently does nothing, since a key matching no material
   * is only reported as a load warning after the fact.
   */
  materialNames(): { arena: string[]; ring: string[] } {
    const names = (meshes: AbstractMesh[]): string[] =>
      [
        ...new Set(
          meshes
            .map((mesh) => mesh.material?.name)
            .filter((name): name is string => !!name)
        ),
      ].sort();

    return {
      arena: names([...this.arenaMeshes, ...this.ceilingMeshes]),
      ring: names([...this.ringMeshes, ...this.stepsMeshes]),
    };
  }

  /** How many meshes are loaded, by group. For tests. */
  meshCounts(): {
    ring: number;
    steps: number;
    arena: number;
    ceiling: number;
  } {
    return {
      ring: this.ringMeshes.length,
      steps: this.stepsMeshes.length,
      arena: this.arenaMeshes.length,
      ceiling: this.ceilingMeshes.length,
    };
  }
}

function clamp(value: number, lower: number | null, upper: number | null): number {
  return Math.min(Math.max(value, lower ?? -Infinity), upper ?? Infinity);
}
