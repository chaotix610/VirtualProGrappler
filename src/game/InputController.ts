import { Scene } from "@babylonjs/core";

/** One-shot actions the player can trigger. */
export type ActionKey = "punch" | "kick" | "jump" | "guard";

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
 * Tracks the keyboard. Movement keys are polled as held state, while actions
 * are queued as edge-triggered events so a single tap fires exactly once even
 * if the key is held down.
 */
export class InputController {
  /** -1 = left, +1 = right, relative to the camera. */
  horizontal = 0;
  /** -1 = backward, +1 = forward, relative to the camera. */
  vertical = 0;
  /** How the current run was started, if one is active. */
  runMode: RunMode = "none";
  /** True while the guard key is held. Blocking is a sustained state, unlike
   *  the one-shot attacks. */
  guarding = false;

  /** Shift state on the previous frame, for press-edge detection. */
  private shiftWasDown = false;

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
      this.runMode = "none";
      this.shiftWasDown = false;
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

    this.updateRunMode(fwd || back || left || right);
  }

  /**
   * Resolves the run latch. The mode is fixed at the instant Shift goes down
   * by whether a direction was already held, and cannot change until the run
   * ends - that is what makes press order meaningful.
   */
  private updateRunMode(anyDirection: boolean): void {
    const shiftDown =
      this.held.has("ShiftLeft") || this.held.has("ShiftRight");

    // Latch on the press edge only. While a run is live the mode is locked,
    // so pressing Shift again mid-run changes nothing.
    if (shiftDown && !this.shiftWasDown && this.runMode === "none") {
      this.runMode = anyDirection ? "directed" : "default";
    }

    if (this.runMode === "default" && !shiftDown) {
      // Directions were ignored for this run, so Shift alone ends it.
      this.runMode = "none";
    } else if (this.runMode === "directed" && !shiftDown && !anyDirection) {
      // Releasing just one of the two keeps the run going.
      this.runMode = "none";
    }

    this.shiftWasDown = shiftDown;
  }

  /** True while a run of either kind is active. */
  get isRunning(): boolean {
    return this.runMode !== "none";
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
