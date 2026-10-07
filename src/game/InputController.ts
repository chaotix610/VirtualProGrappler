import { Scene } from "@babylonjs/core";

/** One-shot actions the player can trigger. */
export type ActionKey = "punch" | "kick" | "jump" | "guard" | "evade";

/**
 * How a run was started, which decides how it steers and how it ends.
 *
 * - `directed`: a direction was already held when Shift went down. The run
 *   follows the stick, and only ends once Shift *and* every direction key are
 *   released.
 * - `default`: Shift went down with no direction held. The run goes in the
 *   default direction and ignores any direction pressed afterwards, so it
 *   ends the moment Shift comes up.
 */
export type RunMode = "none" | "directed" | "default";

/**
 * What a CharacterController reads from its input each frame.
 *
 * Two sources implement it: this file's InputController, with the original
 * combat test's fixed keyboard layout, and PadInput, which reads the N64 pad
 * bindings from the control mapper. The controller cannot tell them apart.
 */
export interface CharacterInput {
  /** -1 = left, +1 = right, relative to the camera. */
  readonly horizontal: number;
  /** -1 = backward, +1 = forward, relative to the camera. */
  readonly vertical: number;
  /** How the current run was started, if one is active. */
  readonly runMode: RunMode;
  /** True while the guard input is held. */
  readonly guarding: boolean;
  /** True while a run of either kind is active. */
  readonly isRunning: boolean;
  /** True when a direction is held. */
  readonly hasMovement: boolean;
  /** Refreshes the held state. Called once per frame before movement. */
  update(): void;
  /** Removes and returns the next queued action, if any. */
  consumeAction(): ActionKey | undefined;
  dispose(): void;
}

/**
 * Tracks the keyboard. Movement keys are polled as held state, while actions
 * are queued as edge-triggered events so a single tap fires exactly once even
 * if the key is held down.
 */
export class InputController implements CharacterInput {
  /** -1 = left, +1 = right, relative to the camera. */
  horizontal = 0;
  /** -1 = backward, +1 = forward, relative to the camera. */
  vertical = 0;
  /** True while the guard key is held. Blocking is a sustained state, unlike
   *  the one-shot attacks. */
  guarding = false;

  /** Shift is the run modifier on this layout. */
  private readonly run = new RunLatch();

  private held = new Set<string>();
  private queued: ActionKey[] = [];
  private readonly onKeyDown: (e: KeyboardEvent) => void;
  private readonly onKeyUp: (e: KeyboardEvent) => void;
  private readonly onBlur: () => void;

  private static readonly ACTIONS: Record<string, ActionKey> = {
    KeyJ: "punch",
    KeyK: "kick",
    KeyL: "jump",
    // P is dual-purpose: the press decides between a roll and a block, while
    // `guarding` tracks the hold that sustains the block.
    KeyP: "guard",
  };

  constructor(private scene: Scene) {
    this.onKeyDown = (e) => {
      // `code` is layout-independent, so WASD works on AZERTY hardware too.
      if (!this.held.has(e.code)) {
        const action = InputController.ACTIONS[e.code];
        if (action) this.queued.push(action);
      }
      this.held.add(e.code);
      // Stop the browser scrolling the page while the player moves.
      if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
    };

    this.onKeyUp = (e) => this.held.delete(e.code);

    // Losing focus mid-stride would otherwise leave keys stuck down.
    this.onBlur = () => {
      this.held.clear();
      this.queued.length = 0;
      this.run.reset();
    };

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  /** Refreshes the held-key state. Call once per frame before movement. */
  update(): void {
    const fwd = this.held.has("KeyW") || this.held.has("ArrowUp");
    const back = this.held.has("KeyS") || this.held.has("ArrowDown");
    const left = this.held.has("KeyA") || this.held.has("ArrowLeft");
    const right = this.held.has("KeyD") || this.held.has("ArrowRight");

    this.vertical = (fwd ? 1 : 0) - (back ? 1 : 0);
    this.horizontal = (right ? 1 : 0) - (left ? 1 : 0);
    this.guarding = this.held.has("KeyP");

    this.run.update(
      this.held.has("ShiftLeft") || this.held.has("ShiftRight"),
      fwd || back || left || right
    );
  }

  /** How the current run was started, if one is active. */
  get runMode(): RunMode {
    return this.run.mode;
  }

  /** True while a run of either kind is active. */
  get isRunning(): boolean {
    return this.run.mode !== "none";
  }

  /** True when a direction key is held. */
  get hasMovement(): boolean {
    return this.horizontal !== 0 || this.vertical !== 0;
  }

  /** Removes and returns the next queued action, if any. */
  consumeAction(): ActionKey | undefined {
    return this.queued.shift();
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.held.clear();
    this.queued.length = 0;
  }
}

/**
 * The run latch, shared by every input source so they all run the same way.
 *
 * The mode is fixed at the instant the run input goes down by whether a
 * direction was already held, and cannot change until the run ends - that is
 * what makes press order meaningful.
 */
export class RunLatch {
  mode: RunMode = "none";
  /** Run input state on the previous update, for press-edge detection. */
  private wasDown = false;

  update(runDown: boolean, anyDirection: boolean): void {
    // Latch on the press edge only. While a run is live the mode is locked,
    // so pressing run again mid-run changes nothing.
    if (runDown && !this.wasDown && this.mode === "none") {
      this.mode = anyDirection ? "directed" : "default";
    }

    if (this.mode === "default" && !runDown) {
      // Directions were ignored for this run, so the run input alone ends it.
      this.mode = "none";
    } else if (this.mode === "directed" && !runDown && !anyDirection) {
      // Releasing just one of the two keeps the run going.
      this.mode = "none";
    }

    this.wasDown = runDown;
  }

  reset(): void {
    this.mode = "none";
    this.wasDown = false;
  }
}
