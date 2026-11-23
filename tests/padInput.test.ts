import { afterEach, describe, expect, it } from "vitest";
import { PadInput, RUN_CONTROL } from "@/game/PadInput";
import { bindKey, controlForKey, resetBindings } from "@/data/controls";

/**
 * PadInput is driven through `press` and `release` here, with no window, so
 * these exercise the gameplay rules rather than the DOM plumbing. The one
 * test that goes through a key code checks the plumbing reads the mapper.
 */
describe("PadInput", () => {
  afterEach(() => resetBindings());

  it("moves on the control stick and the d-pad alike", () => {
    const input = new PadInput(null);

    input.press("controlStickUp");
    input.update();
    expect(input.vertical).toBe(1);

    input.release("controlStickUp");
    input.press("dpadLeft");
    input.update();
    expect(input.vertical).toBe(0);
    expect(input.horizontal).toBe(-1);
    expect(input.hasMovement).toBe(true);
  });

  it("runs on C-Down, latching how the run began", () => {
    expect(RUN_CONTROL).toBe("cDown");
    const input = new PadInput(null);

    // Run pressed with no direction: a default run, ended by letting go.
    input.press("cDown");
    input.update();
    expect(input.runMode).toBe("default");
    input.release("cDown");
    input.update();
    expect(input.isRunning).toBe(false);

    // A direction first: a directed run, which outlives the run button while
    // the direction is still held.
    input.press("controlStickRight");
    input.update();
    input.press("cDown");
    input.update();
    expect(input.runMode).toBe("directed");
    input.release("cDown");
    input.update();
    expect(input.isRunning).toBe(true);
    input.release("controlStickRight");
    input.update();
    expect(input.isRunning).toBe(false);
  });

  it("punches on B, and kicks on B with a direction held", () => {
    const input = new PadInput(null);

    input.press("b");
    expect(input.consumeAction()).toBe("punch");
    input.release("b");

    input.press("dpadUp");
    input.press("b");
    expect(input.consumeAction()).toBe("kick");
  });

  it("guards on R, and fires once per press", () => {
    const input = new PadInput(null);

    input.press("r");
    // Key repeat re-sends the press while held; it must not queue again.
    input.press("r");
    input.update();
    expect(input.guarding).toBe(true);
    expect(input.consumeAction()).toBe("guard");
    expect(input.consumeAction()).toBeUndefined();
  });

  it("evades on L", () => {
    const input = new PadInput(null);
    input.press("l");
    expect(input.consumeAction()).toBe("evade");
  });

  it("ignores everything while paused, and drops what was held", () => {
    const input = new PadInput(null);
    input.press("cDown");
    input.update();
    expect(input.isRunning).toBe(true);

    input.setActive(false);
    input.update();
    expect(input.isRunning).toBe(false);

    input.press("b");
    expect(input.consumeAction()).toBeUndefined();
  });

  it("follows a rebind made in the control mapper", () => {
    bindKey("cDown", "ShiftLeft");
    expect(controlForKey("ShiftLeft")).toBe("cDown");

    const events = new EventTarget();
    const input = new PadInput(events as unknown as Window);
    events.dispatchEvent(
      Object.assign(new Event("keydown"), { code: "ShiftLeft", key: "Shift" })
    );
    input.update();
    expect(input.isRunning).toBe(true);
    input.dispose();
  });
});
