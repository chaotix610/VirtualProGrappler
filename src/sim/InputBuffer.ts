import { SIM_HZ } from "./FixedStep";

/**
 * Frame-stamped input history.
 *
 * The blueprint's move pipeline needs two things this provides: inputs
 * timestamped by simulation frame, so a reversal can be judged against a
 * move's frame window arithmetically rather than by wall-clock; and a tap /
 * hold distinction, which is what separates weak from strong moves.
 */

/** Logical actions the combat layer reasons about, independent of keys. */
export type CombatAction =
  | "strike"
  | "grapple"
  | "block"
  | "run"
  | "up"
  | "down"
  | "left"
  | "right";

export type InputStrength = "tap" | "hold";

/** A completed press. */
export interface InputEvent {
  action: CombatAction;
  /** Frame the press began. */
  frame: number;
  /** Frame it ended, or null while still held. */
  releaseFrame: number | null;
  strength: InputStrength;
}

/**
 * Frames a press must be held to count as strong. Roughly a fifth of a
 * second, long enough to be deliberate but short enough not to feel sluggish.
 */
export const HOLD_THRESHOLD_FRAMES = Math.round(SIM_HZ * 0.2);

/** How many frames of history to keep. Two seconds is far more than any
 *  reversal or buffer window needs. */
const HISTORY_FRAMES = SIM_HZ * 2;

export class InputBuffer {
  private events: InputEvent[] = [];
  private open = new Map<CombatAction, InputEvent>();

  /** Records the start of a press. Repeat presses while held are ignored. */
  press(action: CombatAction, frame: number): void {
    if (this.open.has(action)) return;
    const event: InputEvent = {
      action,
      frame,
      releaseFrame: null,
      strength: "tap",
    };
    this.open.set(action, event);
    this.events.push(event);
  }

  /** Records the end of a press, settling whether it was a tap or a hold. */
  release(action: CombatAction, frame: number): void {
    const event = this.open.get(action);
    if (!event) return;
    event.releaseFrame = frame;
    event.strength =
      frame - event.frame >= HOLD_THRESHOLD_FRAMES ? "hold" : "tap";
    this.open.delete(action);
  }

  /** True while the action is currently down. */
  isDown(action: CombatAction): boolean {
    return this.open.has(action);
  }

  /**
   * Strength of a press as it stands right now: a press still being held
   * counts as strong once it passes the threshold, without waiting for the
   * release.
   */
  strengthOf(action: CombatAction, frame: number): InputStrength | null {
    const held = this.open.get(action);
    if (held) {
      return frame - held.frame >= HOLD_THRESHOLD_FRAMES ? "hold" : "tap";
    }
    const last = this.lastOf(action);
    return last ? last.strength : null;
  }

  /** Most recent event for an action, held or released. */
  lastOf(action: CombatAction): InputEvent | null {
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].action === action) return this.events[i];
    }
    return null;
  }

  /**
   * Whether an action was pressed within an inclusive frame window. This is
   * the primitive a reversal check uses: "did the defender press block in the
   * four frames ending on the hit frame?"
   */
  pressedWithin(action: CombatAction, start: number, end: number): boolean {
    return this.events.some(
      (e) => e.action === action && e.frame >= start && e.frame <= end
    );
  }

  /** Every event in a window, oldest first. */
  eventsWithin(start: number, end: number): InputEvent[] {
    return this.events.filter((e) => e.frame >= start && e.frame <= end);
  }

  /** Drops history older than the retention window. Call once per frame. */
  prune(frame: number): void {
    const cutoff = frame - HISTORY_FRAMES;
    if (cutoff <= 0) return;
    this.events = this.events.filter(
      (e) => e.frame >= cutoff || e.releaseFrame === null
    );
  }

  clear(): void {
    this.events = [];
    this.open.clear();
  }
}
