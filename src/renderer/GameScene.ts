import {
  AbstractMesh,
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  ImportMeshAsync,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
// Side-effect import: registers the glTF/GLB loader with the SceneLoader.
import "@babylonjs/loaders/glTF";

import { AnimationController } from "./AnimationController";
import { CharacterController } from "../game/CharacterController";
import { InputController } from "../game/InputController";
import { Opponent } from "./Opponent";
import { RingRopes } from "./RingRopes";
import { Match, Side } from "../combat/Match";
import { MOVES } from "../combat/moves";
import { profileFor } from "../combat/profiles";
import { MoveData } from "../combat/types";
import { FixedStep } from "../sim/FixedStep";
import { InputBuffer } from "../sim/InputBuffer";
import {
  MODEL_ROOT,
  TEXTURE_ROOT,
  CharacterDefinition,
  REQUIRED_CLIPS,
  RING,
  SPAWN,
  opponentFor,
  RING_VIEW,
  RingBounds,
  Tuning,
} from "../game/config";

/**
 * Owns the engine, the scene and the render loop. A single instance lives for
 * as long as the canvas does; `loadCharacter` can be called repeatedly to swap
 * the player model without tearing anything else down.
 */
export class GameScene {
  readonly engine: Engine;
  readonly scene: Scene;

  private camera: ArcRotateCamera;
  private shadows: ShadowGenerator;
  private input: InputController;
  private arenaFloor: Mesh | null = null;

  private playerRoot: TransformNode | null = null;
  private controller: CharacterController | null = null;
  private animations: AnimationController | null = null;
  /** Play area inside the ropes, derived from the ring geometry. */
  private bounds: RingBounds | null = null;
  private ringReady: Promise<void>;
  private ropes: RingRopes | null = null;
  /** Extents of the whole ring, used to frame the fixed camera. */
  private ringFrame: {
    centre: Vector3;
    halfWidth: number;
    halfHeight: number;
    halfDepth: number;
  } | null = null;
  /** Meshes and materials belonging to the current character, for disposal. */
  private loadedNodes: TransformNode[] = [];
  private opponent: Opponent | null = null;
  private opponentNodes: TransformNode[] = [];

  /** Fixed-rate clock the combat simulation advances on. */
  private readonly clock = new FixedStep();
  private readonly inputBuffer = new InputBuffer();
  private match: Match | null = null;

  private readonly onResize: () => void;

  constructor(private canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { stencil: true }, true);
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.53, 0.69, 0.84, 1);

    this.camera = this.createCamera();
    this.shadows = this.createLighting();
    this.createGround();
    this.input = new InputController(this.scene);
    // A missing or malformed ring must not stop the match starting; the
    // controller falls back to a flat arena when bounds are unavailable.
    this.ringReady = this.loadRing().catch((err) => {
      console.warn("Ring failed to load, using flat arena:", err);
    });

    this.scene.onBeforeRenderObservable.add(() => {
      const dt = this.engine.getDeltaTime() / 1000;

      // Presentation runs at display rate...
      this.controller?.update(dt);
      // The opponent has no AI, but it always squares up to the player.
      this.opponent?.update(dt, this.playerRoot?.position ?? null);
      // Ropes keep oscillating after the wrestler has left them.
      this.ropes?.update(dt);

      // ...while combat advances on a fixed clock, so hit frames and reversal
      // windows are counted in equal, reproducible steps.
      this.clock.advance(dt, (frame) => {
        this.match?.step(frame);
        this.inputBuffer.prune(frame);
      });
    });

    this.engine.runRenderLoop(() => this.scene.render());

    this.onResize = () => {
      this.engine.resize();
      // The framing distance depends on the aspect ratio, so re-solve it.
      this.frameRing();
    };
    window.addEventListener("resize", this.onResize);

    if (import.meta.env.DEV) {
      // Handle for automated smoke tests to inspect live state.
      (window as unknown as Record<string, unknown>).__game = this;
    }
  }

  /** Name of the animation clip currently blended in. Used by tests. */
  get currentAnimation(): string | null {
    return this.animations?.current ?? null;
  }

  /** Player world position. Used by tests. */
  get playerPosition(): { x: number; y: number; z: number } | null {
    if (!this.playerRoot) return null;
    const p = this.playerRoot.position;
    return { x: p.x, y: p.y, z: p.z };
  }

  /** Live position vector, so tests can reposition the player. */
  get playerPositionRef(): Vector3 | null {
    return this.playerRoot?.position ?? null;
  }

  /** Play area derived from the ring. Used by tests. */
  get ringBounds(): RingBounds | null {
    return this.bounds;
  }

  /** Rope springs. Used by tests. */
  get ringRopes(): RingRopes | null {
    return this.ropes;
  }

  /** Current horizontal speed, for tests and future HUD readouts. */
  get playerSpeed(): number {
    return this.controller?.currentSpeed ?? 0;
  }

  /** Facing in radians. Used by tests. */
  get playerFacing(): number {
    return this.controller?.facing ?? 0;
  }

  /** Opponent world position, or null if none is loaded. Used by tests. */
  get opponentPosition(): { x: number; y: number; z: number } | null {
    if (!this.opponent) return null;
    const p = this.opponent.position;
    return { x: p.x, y: p.y, z: p.z };
  }

  /** Opponent facing in radians. Used by tests. */
  get opponentFacing(): number {
    return this.opponent?.root.rotation.y ?? 0;
  }

  /**
   * Places the wrestler at a spot and facing, clearing momentum. Used by
   * tests now and by match resets later.
   */
  teleportPlayer(x: number, z: number, yaw?: number): void {
    if (!this.playerRoot || !this.controller) return;
    this.playerRoot.position.set(x, 0, z);
    this.controller.resetMotion();
    if (yaw !== undefined) this.controller.setFacing(yaw);
  }

  /**
   * A fixed ringside camera. It never moves, never follows and cannot be
   * orbited - the whole match is played out in one framing, the way the
   * 1990s wrestling games did it.
   *
   * Note this also makes the controls stable: movement is camera-relative,
   * and with the camera pinned, "W" is always the same direction on screen.
   */
  private createCamera(): ArcRotateCamera {
    // ArcRotate is used purely as a convenient way to express "sit at this
    // angle and distance, looking here". No control is attached to it.
    const camera = new ArcRotateCamera(
      "ringsideCamera",
      -Math.PI / 2,
      RING_VIEW.beta,
      12,
      new Vector3(0, RING_VIEW.lookHeight, 0),
      this.scene
    );
    return camera;
  }

  /**
   * Pulls the camera back far enough to hold the whole ring in frame.
   *
   * The distance is solved from the viewport rather than hard-coded, so the
   * ring stays fully visible on any aspect ratio.
   */
  private frameRing(): void {
    if (!this.ringFrame) return;

    const { centre, halfWidth, halfHeight, halfDepth } = this.ringFrame;
    const vFov = this.camera.fov;
    const aspect = this.engine.getAspectRatio(this.camera) || 1;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);

    const margin = RING_VIEW.margin;
    const forHeight = (halfHeight * margin) / Math.tan(vFov / 2);
    const forWidth = (halfWidth * margin) / Math.tan(hFov / 2);

    // Target first: setTarget re-derives alpha/beta/radius from the camera's
    // current position, so setting them beforehand would be thrown away.
    this.camera.setTarget(
      new Vector3(centre.x, centre.y + RING_VIEW.lookHeight, centre.z)
    );

    this.camera.alpha = -Math.PI / 2;
    this.camera.beta = RING_VIEW.beta;
    // Add the ring's own depth: the far side has to fit too.
    this.camera.radius = Math.max(forHeight, forWidth) + halfDepth;
  }

  private createLighting(): ShadowGenerator {
    const hemi = new HemisphericLight(
      "hemiLight",
      new Vector3(0, 1, 0),
      this.scene
    );
    hemi.intensity = 0.55;
    hemi.groundColor = new Color3(0.3, 0.32, 0.36);

    const sun = new DirectionalLight(
      "sun",
      new Vector3(-0.6, -1, 0.4),
      this.scene
    );
    sun.position = new Vector3(12, 20, -12);
    sun.intensity = 1.6;

    const shadows = new ShadowGenerator(1024, sun);
    shadows.useBlurExponentialShadowMap = true;
    shadows.blurKernel = 24;
    return shadows;
  }

  private createGround(): Mesh {
    const ground = MeshBuilder.CreateGround(
      "ground",
      { width: Tuning.groundSize, height: Tuning.groundSize },
      this.scene
    );

    const material = new StandardMaterial("groundMat", this.scene);
    material.diffuseColor = new Color3(0.14, 0.13, 0.16);
    material.specularColor = new Color3(0.02, 0.02, 0.02);
    ground.material = material;
    ground.receiveShadows = true;
    // Arena floor sits below the ring; the exact drop is set once the ring
    // has loaded and its apron height is known.
    ground.position.y = -1.6;
    this.arenaFloor = ground;
    return ground;
  }

  /**
   * Loads the ring, moves it so the mat sits at y=0 centred on the origin,
   * and derives the play area from the rope meshes.
   *
   * Bounds are measured from the geometry rather than hard-coded so a
   * different ring model drops in without touching this code.
   */
  private async loadRing(): Promise<void> {
    const result = await ImportMeshAsync(RING.file, this.scene);

    const root = new TransformNode("ringRoot", this.scene);
    for (const mesh of result.meshes) {
      if (!mesh.parent) mesh.parent = root;
    }

    const meshes = result.meshes.filter(
      (m) => m instanceof Mesh && m.getTotalVertices() > 0
    ) as Mesh[];
    for (const m of meshes) {
      m.refreshBoundingInfo();
      m.receiveShadows = true;
    }

    const canvas = meshes.find((m) => m.name.includes(RING.canvasMesh));
    const ropes = meshes.filter((m) => m.name.startsWith(RING.ropePrefix));

    if (!canvas || !ropes.length) {
      // Without the expected meshes, leave the ring where it is and fall back
      // to a bare arena so the game still plays.
      console.warn("Ring meshes not found; skipping ring alignment");
      return;
    }

    // Drop the mat to y=0 and centre it, so the character controller can keep
    // treating the standing surface as y=0.
    const cb = canvas.getBoundingInfo().boundingBox;
    const offset = new Vector3(
      -(cb.minimumWorld.x + cb.maximumWorld.x) / 2,
      -cb.maximumWorld.y,
      -(cb.minimumWorld.z + cb.maximumWorld.z) / 2
    );
    root.position.addInPlace(offset);
    root.computeWorldMatrix(true);

    // Whole-ring extents, including posts, so the camera can frame it.
    let ringMinX = Infinity, ringMaxX = -Infinity;
    let ringMinY = Infinity, ringMaxY = -Infinity;
    let ringMinZ = Infinity, ringMaxZ = -Infinity;

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    let topRopeY = 0;
    let apronBottom = Infinity;
    for (const rope of ropes) {
      rope.computeWorldMatrix(true);
      rope.refreshBoundingInfo();
      const b = rope.getBoundingInfo().boundingBox;
      minX = Math.min(minX, b.minimumWorld.x);
      maxX = Math.max(maxX, b.maximumWorld.x);
      minZ = Math.min(minZ, b.minimumWorld.z);
      maxZ = Math.max(maxZ, b.maximumWorld.z);
      // The highest rope is the one wrestlers stand on.
      topRopeY = Math.max(topRopeY, b.centerWorld.y);
    }
    for (const m of meshes) {
      m.computeWorldMatrix(true);
      const b = m.getBoundingInfo().boundingBox;
      apronBottom = Math.min(apronBottom, b.minimumWorld.y);
      ringMinX = Math.min(ringMinX, b.minimumWorld.x);
      ringMaxX = Math.max(ringMaxX, b.maximumWorld.x);
      ringMinY = Math.min(ringMinY, b.minimumWorld.y);
      ringMaxY = Math.max(ringMaxY, b.maximumWorld.y);
      ringMinZ = Math.min(ringMinZ, b.minimumWorld.z);
      ringMaxZ = Math.max(ringMaxZ, b.maximumWorld.z);
    }

    this.ringFrame = {
      centre: new Vector3(
        (ringMinX + ringMaxX) / 2,
        (ringMinY + ringMaxY) / 2,
        (ringMinZ + ringMaxZ) / 2
      ),
      halfWidth: (ringMaxX - ringMinX) / 2,
      halfHeight: (ringMaxY - ringMinY) / 2,
      halfDepth: (ringMaxZ - ringMinZ) / 2,
    };
    this.frameRing();

    const r = Tuning.bodyRadius;
    this.bounds = {
      minX: minX + r,
      maxX: maxX - r,
      minZ: minZ + r,
      maxZ: maxZ - r,
      topRopeY,
    };

    // Ring centre in world terms, so each rope knows which way is outward.
    const centre = new Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    this.ropes = new RingRopes(ropes, centre, this.scene);

    this.controller?.setBounds(this.bounds);
    this.controller?.setRopes(this.ropes);

    if (this.arenaFloor && Number.isFinite(apronBottom)) {
      this.arenaFloor.position.y = apronBottom;
    }
  }

  /**
   * Loads (or replaces) the playable character. Resolves once the model and
   * its clips are ready and the controller is live.
   */
  /**
   * Loads one wrestler: mesh under a node we own, skin tone applied, clips
   * wrapped in an AnimationController.
   */
  private async loadWrestler(
    definition: CharacterDefinition,
    nodeName: string,
    spawn: { x: number; z: number }
  ): Promise<{
    root: TransformNode;
    animations: AnimationController;
    nodes: TransformNode[];
  }> {
    const result = await ImportMeshAsync(
      MODEL_ROOT + definition.file,
      this.scene
    );

    // A parent node we own, so movement never fights the glTF's own transforms.
    const root = new TransformNode(nodeName, this.scene);
    root.position = new Vector3(spawn.x, 0, spawn.z);

    const nodes: TransformNode[] = [];
    for (const mesh of result.meshes) {
      if (!mesh.parent) {
        mesh.parent = root;
        nodes.push(mesh);
      }
      mesh.receiveShadows = true;
      if (mesh instanceof Mesh && mesh.getTotalVertices() > 0) {
        this.shadows.addShadowCaster(mesh);
      }
    }

    // Scope the material lookup to this wrestler's own meshes: both are in
    // the scene at once, and searching globally could hit the other one.
    this.applySkinTone(definition, result.meshes);

    return {
      root,
      animations: new AnimationController(result.animationGroups),
      nodes,
    };
  }

  async loadCharacter(definition: CharacterDefinition): Promise<string[]> {
    this.disposeCharacter();

    // The ring defines the play area, so it must be measured before the
    // controller starts clamping and rebounding against it.
    await this.ringReady;

    const player = await this.loadWrestler(
      definition,
      "playerRoot",
      SPAWN.player
    );
    const root = player.root;
    this.loadedNodes.push(...player.nodes);
    this.animations = player.animations;

    // The opponent is inert for now; it exists so the player has someone to
    // square up to.
    const opponentDef = opponentFor(definition);
    const other = await this.loadWrestler(
      opponentDef,
      "opponentRoot",
      SPAWN.opponent
    );
    this.opponent = new Opponent(other.root, other.animations);
    this.opponentNodes = other.nodes;

    const missing = REQUIRED_CLIPS.filter((c) => !this.animations!.has(c));

    this.playerRoot = root;
    this.controller = new CharacterController(
      root,
      this.animations,
      this.input,
      this.camera,
      this.bounds,
      this.ropes
    );
    // Facing and default runs both key off where the opponent is.
    this.controller.opponentPosition = () => this.opponent?.position ?? null;
    this.controller.setFacing(Math.atan2(0, SPAWN.opponent.z - SPAWN.player.z));

    this.startMatch(definition.id, opponentDef.id);

    // The camera is deliberately not re-aimed at the character: it stays on
    // the ring for the whole match.
    return missing;
  }

  /**
   * Opens a new match: fresh health, stamina and RNG for both wrestlers, and
   * the strike inputs wired through to the damage engine.
   */
  private startMatch(playerId: string, opponentId: string): void {
    this.clock.reset();
    this.inputBuffer.clear();
    this.match = new Match(profileFor(playerId), profileFor(opponentId));

    // Range is a scene question, so the match asks rather than assumes.
    this.match.canConnect = (attacker: Side) => this.inStrikeRange(attacker);

    // A thrown strike is registered on the simulation clock; the damage lands
    // later, on the move's hit frame.
    this.controller?.setStrikeHandler((moveId) => {
      const move: MoveData | null = MOVES[moveId] ?? null;
      if (!move || !this.match) return;
      this.inputBuffer.press("strike", this.clock.frame);
      this.inputBuffer.release("strike", this.clock.frame);
      this.match.throwMove("player", move, this.clock.frame);
    });
  }

  /**
   * Whether an attack can reach: close enough, and roughly facing the target.
   * A wrestler swinging with his back turned should miss.
   */
  private inStrikeRange(attacker: Side): boolean {
    if (!this.playerRoot || !this.opponent) return false;

    const from = attacker === "player" ? this.playerRoot : this.opponent.root;
    const to = attacker === "player" ? this.opponent.root : this.playerRoot;

    const dx = to.position.x - from.position.x;
    const dz = to.position.z - from.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > Tuning.strikeRange) return false;

    // Angle between where the attacker faces and where the target is.
    const toTarget = Math.atan2(dx, dz);
    let delta = (toTarget - from.rotation.y) % (Math.PI * 2);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    return Math.abs(delta) <= Tuning.strikeArc;
  }

  /** Live combat state for the debug overlay. */
  matchSnapshot() {
    return this.match?.snapshot() ?? null;
  }

  /** Simulation frame count. Used by the overlay and tests. */
  get simFrame(): number {
    return this.clock.frame;
  }

  /** Swaps the body albedo texture and tint for the chosen skin tone. */
  private applySkinTone(
    definition: CharacterDefinition,
    meshes: AbstractMesh[]
  ): void {
    // A bespoke character ships its own textures and names no body material,
    // so there is no re-skin to do. Checked before the lookup because an
    // undefined name would otherwise match any unnamed material it met.
    if (!definition.bodyMaterial) return;

    const material = meshes
      .map((m) => m.material)
      .find((m) => m?.name === definition.bodyMaterial);
    if (!(material instanceof PBRMaterial)) return;

    if (definition.tint) {
      const [r, g, b] = definition.tint;
      material.albedoColor = new Color3(r, g, b);
    }

    if (!definition.bodyTexture) return;

    const previous = material.albedoTexture as Texture | null;

    // glTF images are top-left origin, so the loader builds them with
    // invertY false and no V flip. The replacement must match exactly or the
    // skin renders upside-down.
    const texture = new Texture(
      TEXTURE_ROOT + definition.bodyTexture,
      this.scene,
      undefined,
      false
    );

    if (previous) {
      texture.coordinatesIndex = previous.coordinatesIndex;
      texture.wrapU = previous.wrapU;
      texture.wrapV = previous.wrapV;
      texture.uScale = previous.uScale;
      texture.vScale = previous.vScale;
      texture.uOffset = previous.uOffset;
      texture.vOffset = previous.vOffset;
    }

    material.albedoTexture = texture;
    previous?.dispose();
  }

  private disposeCharacter(): void {
    this.animations?.dispose();
    this.animations = null;
    this.controller = null;

    for (const node of this.loadedNodes) {
      node.dispose(false, true);
    }
    this.loadedNodes = [];

    this.playerRoot?.dispose();
    this.playerRoot = null;

    for (const node of this.opponentNodes) {
      node.dispose(false, true);
    }
    this.opponentNodes = [];
    this.opponent?.dispose();
    this.opponent = null;
  }

  dispose(): void {
    window.removeEventListener("resize", this.onResize);
    this.disposeCharacter();
    this.input.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
