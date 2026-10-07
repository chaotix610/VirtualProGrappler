import { PadControl, controlForKey } from "../data/controls";
import { eventCode } from "./VirtualController";
import {
  ActionKey,
  CharacterInput,
  RunLatch,
  RunMode,
} from "./InputController";

/**
 * Gameplay input read through the N64 pad bindings.
 *
 * Every key is looked up in the control mapper's bindings, so rebinding a
 * control there changes how the wrestler is driven with no further work. The
 * layout follows the move slots in data/moves/move-slots.json:
 *
 * - Control Stick or D-Pad: move.
 * - C-Down: Run. The slots write it as `[Run]`; holding it into the ropes
 *   rebounds, into a corner climbs, and letting go on the top rope dives.
 * - B: strike. With a direction held it is a kick, otherwise a punch.
 * - R: guard while held. `[Run] + [R]` is the evasion slot, so with a run
 *   live it rolls instead.
 * - L: evade. Rolls whether or not a run is live.
 *
 * A (grapple) and Z have slots too, but nothing in the engine plays them yet,
 * so they are left unclaimed rather than given stand-ins.
 */

/** Which pad control acts as `[Run]` in the slot definitions. */
export const RUN_CONTROL: PadControl = "cDown";

const UP: PadControl[] = ["controlStickUp", "dpadUp"];
const DOWN: PadControl[] = ["controlStickDown", "dpadDown"];
const LEFT: PadControl[] = ["controlStickLeft", "dpadLeft"];
const RIGHT: PadControl[] = ["controlStickRight", "dpadRight"];

export class PadInput implements CharacterInput {
  horizontal = 0;
  vertical = 0;
  guarding = false;

  /**
   * While false, presses are ignored and nothing is held. Set by a pause, so
   * a key that is down when the game pauses cannot carry a run through it.
   */
  private active = true;

  private readonly run = new RunLatch();
  private readonly held = new Set<PadControl>();
  private readonly queued: ActionKey[] = [];

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const control = controlForKey(eventCode(e));
    if (!control) return;
    // Bound keys belong to the game: stop Space and the arrows scrolling.
    e.preventDefault();
    this.press(control);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    const control = controlForKey(eventCode(e));
    if (control) this.release(control);
  };

  /** Losing focus mid-stride would otherwise leave controls stuck down. */
  private readonly onBlur = (): void => this.clear();

  /**
   * Where key events come from. Defaults to the window; null leaves the
   * input driven only through `press` and `release`, which is how the unit
   * tests use it.
   */
  constructor(
    private readonly target: Window | null = typeof window === "undefined"
      ? null
      : window
  ) {
    target?.addEventListener("keydown", this.onKeyDown);
    target?.addEventListener("keyup", this.onKeyUp);
    target?.addEventListener("blur", this.onBlur);
  }

  /**
   * A pad control went down. Exposed so tests can drive the pad without a
   * keyboard; the key listeners route through here.
   */
  press(control: PadControl): void {
    if (!this.active) return;
    // Key repeat sends keydown again while held: one-shots fire on the edge.
    if (this.held.has(control)) return;
    this.held.add(control);

    if (control === "b") {
      this.queued.push(this.hasDirectionHeld() ? "kick" : "punch");
    } else if (control === "r") {
      // Dual purpose, as in the slots: the press decides between a roll and a
      // block, while `guarding` tracks the hold that sustains the block.
      this.queued.push("guard");
    } else if (control === "l") {
      this.queued.push("evade");
    }
  }

  release(control: PadControl): void {
    this.held.delete(control);
  }

  /** Drops everything held and queued, and ends any run. */
  clear(): void {
    this.held.clear();
    this.queued.length = 0;
    this.run.reset();
    this.horizontal = 0;
    this.vertical = 0;
    this.guarding = false;
  }

  /** Pauses or resumes input. Pausing clears whatever was held. */
  setActive(active: boolean): void {
    this.active = active;
    if (!active) this.clear();
  }

  update(): void {
    const up = this.anyHeld(UP);
    const down = this.anyHeld(DOWN);
    const left = this.anyHeld(LEFT);
    const right = this.anyHeld(RIGHT);

    this.vertical = (up ? 1 : 0) - (down ? 1 : 0);
    this.horizontal = (right ? 1 : 0) - (left ? 1 : 0);
    this.guarding = this.held.has("r");

    this.run.update(this.held.has(RUN_CONTROL), up || down || left || right);
  }

  get runMode(): RunMode {
    return this.run.mode;
  }

  get isRunning(): boolean {
    return this.run.mode !== "none";
  }

  get hasMovement(): boolean {
    return this.horizontal !== 0 || this.vertical !== 0;
  }

  consumeAction(): ActionKey | undefined {
    return this.queued.shift();
  }

  dispose(): void {
    this.target?.removeEventListener("keydown", this.onKeyDown);
    this.target?.removeEventListener("keyup", this.onKeyUp);
    this.target?.removeEventListener("blur", this.onBlur);
    this.clear();
  }

  private anyHeld(controls: PadControl[]): boolean {
    return controls.some((c) => this.held.has(c));
  }

  private hasDirectionHeld(): boolean {
    return (
      this.anyHeld(UP) ||
      this.anyHeld(DOWN) ||
      this.anyHeld(LEFT) ||
      this.anyHeld(RIGHT)
    );
  }
}
