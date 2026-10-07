import {
  AbstractMesh,
  ArcRotateCamera,
  Color4,
  Engine,
  HemisphericLight,
  ImportMeshAsync,
  Scene,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
// Side-effect import: registers the glTF/GLB loader with the SceneLoader.
import "@babylonjs/loaders/glTF";

import { AnimationController } from "./AnimationController";
import { LoadedArena, allArenaMeshes, disposeArena, loadArena } from "./ArenaLoader";
import { Opponent } from "./Opponent";
import { RingRopes } from "./RingRopes";
import {
  RingLayout,
  alignRingToOrigin,
  frameRingCamera,
  inStrikeRange,
  measureRing,
} from "./ringLayout";
import { CharacterController } from "../game/CharacterController";
import { PadInput } from "../game/PadInput";
import {
  CHARACTERS,
  CharacterDefinition,
  MODEL_ROOT,
  REQUIRED_CLIPS,
  RING_VIEW,
  SPAWN,
  Tuning,
} from "../game/config";
import { arenaById } from "../data/arenas";
import { Match, Side } from "../combat/Match";
import { MOVES } from "../combat/moves";
import { profileFor } from "../combat/profiles";
import { FixedStep } from "../sim/FixedStep";
import { InputBuffer } from "../sim/InputBuffer";

/** The arena Combat System Test 2.0 is staged in. */
export const COMBAT_TEST_ARENA = "raw";

/** Both wrestlers in Combat System Test 2.0. */
export const COMBAT_TEST_CHARACTER = "steve-austin";

/** What a finished load reports back to the screen. */
export interface CombatTestLoadReport {
  /** Clips the game needs that the character GLB lacks. */
  missingClips: string[];
  /** Arena parts or textures that did not load but did not stop the match. */
  arenaWarnings: string[];
}

/**
 * Combat System Test 2.0: Austin against Austin in the RAW arena, driven
 * through the control mapper's pad bindings.
 *
 * Built from the same parts as the original test - CharacterController for
 * movement, ropes and the corner climb, Match for the damage simulation - but
 * staged inside a full arena rather than a bare ring, and fed by PadInput
 * rather than a fixed keyboard layout. The original test is left as it was.
 */
export class CombatTestScene {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly input: PadInput;

  private readonly camera: ArcRotateCamera;
  /** Parent of every arena mesh, moved so the ring's mat sits at y=0. */
  private readonly arenaRoot: TransformNode;
  private arena: LoadedArena | null = null;
  private layout: RingLayout | null = null;
  private ropes: RingRopes | null = null;

  private playerRoot: TransformNode | null = null;
  private playerAnimations: AnimationController | null = null;
  private controller: CharacterController | null = null;
  private opponent: Opponent | null = null;
  private opponentAnimations: AnimationController | null = null;
  /** Top-level nodes of both wrestlers' imports, for disposal. */
  private wrestlerNodes: AbstractMesh[] = [];

  private readonly clock = new FixedStep();
  private readonly inputBuffer = new InputBuffer();
  private match: Match | null = null;
  private paused = false;

  private readonly onResize: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { stencil: true }, true);
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.03, 0.03, 0.05, 1);

    // ArcRotate is used purely as a convenient way to express "sit at this
    // angle and distance, looking here". No control is attached to it: the
    // camera is fixed, which is also what keeps camera-relative movement
    // stable - up on the stick is always the same way on screen.
    this.camera = new ArcRotateCamera(
      "ringsideCamera",
      -Math.PI / 2,
      RING_VIEW.beta,
      12,
      new Vector3(0, RING_VIEW.lookHeight, 0),
      this.scene
    );

    // The arena GLBs are lit by a single hemisphere, as in the Arena Viewer,
    // so the RAW arena looks here the way it does there. Austin is unlit and
    // ignores it.
    const light = new HemisphericLight("arenaLight", new Vector3(0, 1, 0), this.scene);
    light.intensity = 1.0;

    this.arenaRoot = new TransformNode("arenaRoot", this.scene);
    this.input = new PadInput();

    this.scene.onBeforeRenderObservable.add(() => this.tick());
    this.engine.runRenderLoop(() => this.scene.render());

    this.onResize = () => {
      this.engine.resize();
      // The framing distance depends on the aspect ratio, so re-solve it.
      this.frameRing();
    };
    window.addEventListener("resize", this.onResize);

    if (import.meta.env.DEV) {
      // Handle for automated browser tests to inspect live state.
      (window as unknown as Record<string, unknown>).__combat2 = this;
    }
  }

  /**
   * Builds the arena and both wrestlers. Throws when the arena or the
   * character cannot be loaded at all; lesser problems come back as warnings.
   */
  async load(): Promise<CombatTestLoadReport> {
    const arenaData = arenaById(COMBAT_TEST_ARENA);
    if (!arenaData) throw new Error(`No arena data for "${COMBAT_TEST_ARENA}"`);

    const character = CHARACTERS.find((c) => c.id === COMBAT_TEST_CHARACTER);
    if (!character) {
      throw new Error(`No character definition for "${COMBAT_TEST_CHARACTER}"`);
    }

    this.arena = await loadArena(this.scene, arenaData);
    this.placeArena(this.arena);

    const player = await this.loadWrestler(character, "playerRoot", SPAWN.player);
    const other = await this.loadWrestler(character, "opponentRoot", SPAWN.opponent);

    this.playerRoot = player.root;
    this.playerAnimations = player.animations;
    this.opponentAnimations = other.animations;

    // The opponent stands in its idle clip. It squares up to the player, so
    // the player always has someone facing them to circle and run at.
    this.opponent = new Opponent(other.root, other.animations);

    this.controller = new CharacterController(
      player.root,
      player.animations,
      this.input,
      this.camera,
      this.layout?.bounds ?? null,
      this.ropes
    );
    // Facing and default runs both key off where the opponent is.
    this.controller.opponentPosition = () => this.opponent?.position ?? null;
    this.controller.setFacing(Math.atan2(0, SPAWN.opponent.z - SPAWN.player.z));
    other.root.rotation.y = Math.atan2(0, SPAWN.player.z - SPAWN.opponent.z);

    this.startMatch(character.id);

    return {
      missingClips: REQUIRED_CLIPS.filter((c) => !player.animations.has(c)),
      arenaWarnings: this.arena.warnings,
    };
  }

  /**
   * Parents the whole arena to one root and moves it so the ring's mat sits at
   * y=0 on the origin. The arena pieces are authored around the ring, so they
   * move with it as a unit and stay where the Arena Viewer shows them.
   */
  private placeArena(arena: LoadedArena): void {
    for (const mesh of allArenaMeshes(arena)) {
      if (!mesh.parent) mesh.parent = this.arenaRoot;
    }

    if (!alignRingToOrigin(this.arenaRoot, arena.ring)) {
      console.warn("Ring meshes not found; the match has no ropes");
      return;
    }

    this.layout = measureRing(arena.ring);
    if (!this.layout) return;

    this.frameRing();
    this.ropes = new RingRopes(
      this.layout.ropes,
      this.layout.ropeCentre,
      this.scene
    );
  }

  private frameRing(): void {
    if (this.layout) frameRingCamera(this.camera, this.engine, this.layout.frame);
  }

  /** Loads one wrestler under a node this scene owns. */
  private async loadWrestler(
    definition: CharacterDefinition,
    nodeName: string,
    spawn: { x: number; z: number }
  ): Promise<{ root: TransformNode; animations: AnimationController }> {
    const result = await ImportMeshAsync(MODEL_ROOT + definition.file, this.scene);

    // A parent node we own, so movement never fights the glTF's own transforms.
    const root = new TransformNode(nodeName, this.scene);
    root.position = new Vector3(spawn.x, 0, spawn.z);

    for (const mesh of result.meshes) {
      if (!mesh.parent) {
        mesh.parent = root;
        this.wrestlerNodes.push(mesh);
      }
    }

    // Two copies of the same GLB are in the scene, each with its own skeleton
    // and its own animation groups; the controller only ever sees its own.
    return { root, animations: new AnimationController(result.animationGroups) };
  }

  /**
   * Opens the match: fresh health, stamina and RNG for both wrestlers, and the
   * strike inputs wired through to the damage engine.
   */
  private startMatch(characterId: string): void {
    this.clock.reset();
    this.inputBuffer.clear();
    this.match = new Match(profileFor(characterId), profileFor(characterId));

    // Range is a scene question, so the match asks rather than assumes.
    this.match.canConnect = (attacker: Side) => this.canConnect(attacker);

    // A thrown strike is registered on the simulation clock; the damage lands
    // later, on the move's hit frame.
    this.controller?.setStrikeHandler((moveId) => {
      const move = MOVES[moveId] ?? null;
      if (!move || !this.match) return;
      this.inputBuffer.press("strike", this.clock.frame);
      this.inputBuffer.release("strike", this.clock.frame);
      this.match.throwMove("player", move, this.clock.frame);
    });
  }

  private canConnect(attacker: Side): boolean {
    if (!this.playerRoot || !this.opponent) return false;
    return attacker === "player"
      ? inStrikeRange(this.playerRoot, this.opponent.root)
      : inStrikeRange(this.opponent.root, this.playerRoot);
  }

  private tick(): void {
    if (this.paused) return;
    const dt = this.engine.getDeltaTime() / 1000;

    // Presentation runs at display rate...
    this.controller?.update(dt);
    this.keepBodiesApart();
    this.opponent?.update(dt, this.playerRoot?.position ?? null);
    // Ropes keep oscillating after the wrestler has left them.
    this.ropes?.update(dt);

    // ...while combat advances on a fixed clock, so hit frames and reversal
    // windows are counted in equal, reproducible steps.
    this.clock.advance(dt, (frame) => {
      this.match?.step(frame);
      this.inputBuffer.prune(frame);
    });
  }

  /**
   * Stops the player walking through the opponent. Only on the mat: a dive off
   * the top rope is allowed to come down wherever it lands.
   */
  private keepBodiesApart(): void {
    const player = this.playerRoot?.position;
    const other = this.opponent?.position;
    if (!player || !other || player.y > 0.01) return;

    const minGap = Tuning.bodyRadius * 2;
    const dx = player.x - other.x;
    const dz = player.z - other.z;
    const distance = Math.hypot(dx, dz);
    if (distance >= minGap) return;

    // Standing exactly on top of each other has no direction to push in, so
    // fall back to pushing the player back toward their own corner.
    const nx = distance > 1e-4 ? dx / distance : 0;
    const nz = distance > 1e-4 ? dz / distance : -1;
    player.x = other.x + nx * minGap;
    player.z = other.z + nz * minGap;
  }

  /** Freezes the match and drops held input; resuming picks up where it was. */
  setPaused(paused: boolean): void {
    // The scene keeps rendering while paused, so the first frame back is an
    // ordinary frame long: nothing has to be done to stop a jump on resume.
    this.paused = paused;
    this.input.setActive(!paused);
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Live combat state for the debug overlay. */
  matchSnapshot() {
    return this.match?.snapshot() ?? null;
  }

  /** Simulation frame count, for the overlay and tests. */
  get simFrame(): number {
    return this.clock.frame;
  }

  // --- test handles --------------------------------------------------------

  get currentAnimation(): string | null {
    return this.playerAnimations?.current ?? null;
  }

  get opponentAnimation(): string | null {
    return this.opponentAnimations?.current ?? null;
  }

  get playerPosition(): { x: number; y: number; z: number } | null {
    const p = this.playerRoot?.position;
    return p ? { x: p.x, y: p.y, z: p.z } : null;
  }

  get opponentPosition(): { x: number; y: number; z: number } | null {
    const p = this.opponent?.position;
    return p ? { x: p.x, y: p.y, z: p.z } : null;
  }

  get playerFacing(): number {
    return this.controller?.facing ?? 0;
  }

  get playerSpeed(): number {
    return this.controller?.currentSpeed ?? 0;
  }

  get ringBounds() {
    return this.layout?.bounds ?? null;
  }

  get ringRopes(): RingRopes | null {
    return this.ropes;
  }

  /** Places the player at a spot and facing, clearing momentum. */
  teleportPlayer(x: number, z: number, yaw?: number): void {
    if (!this.playerRoot || !this.controller) return;
    this.playerRoot.position.set(x, 0, z);
    this.controller.resetMotion();
    if (yaw !== undefined) this.controller.setFacing(yaw);
  }

  dispose(): void {
    window.removeEventListener("resize", this.onResize);
    this.input.dispose();
    this.playerAnimations?.dispose();
    this.opponent?.dispose();
    for (const node of this.wrestlerNodes) node.dispose(false, true);
    this.wrestlerNodes = [];
    this.playerRoot?.dispose();
    if (this.arena) disposeArena(this.arena);
    this.arena = null;
    this.engine.stopRenderLoop();
    this.scene.dispose();
    this.engine.dispose();
  }
}
