import { describe, expect, it } from "vitest";
import { FixedStep, SIM_DT } from "@/sim/FixedStep";
import { HOLD_THRESHOLD_FRAMES, InputBuffer } from "@/sim/InputBuffer";
import { Rng } from "@/sim/Rng";

describe("fixed step", () => {
  it("runs one step per simulation frame of elapsed time", () => {
    const clock = new FixedStep();
    const frames: number[] = [];
    clock.advance(SIM_DT * 3, (f) => frames.push(f));
    expect(frames).toEqual([1, 2, 3]);
  });

  it("carries a partial frame over instead of losing it", () => {
    const clock = new FixedStep();
    let steps = 0;
    // Two thirds of a frame twice over should produce exactly one step.
    clock.advance(SIM_DT * 0.66, () => steps++);
    expect(steps).toBe(0);
    clock.advance(SIM_DT * 0.66, () => steps++);
    expect(steps).toBe(1);
  });

  it("caps catch-up after a long stall rather than spiralling", () => {
    const clock = new FixedStep();
    let steps = 0;
    clock.advance(10, () => steps++);
    expect(steps).toBeLessThanOrEqual(5);
    // The backlog is dropped, so the next frame is back to normal.
    steps = 0;
    clock.advance(SIM_DT, () => steps++);
    expect(steps).toBe(1);
  });

  it("advances the frame index monotonically", () => {
    const clock = new FixedStep();
    clock.advance(SIM_DT * 2, () => {});
    expect(clock.frame).toBe(2);
    clock.advance(SIM_DT * 2, () => {});
    expect(clock.frame).toBe(4);
  });
});

describe("input buffer", () => {
  it("classifies a short press as a tap", () => {
    const b = new InputBuffer();
    b.press("strike", 10);
    b.release("strike", 10 + HOLD_THRESHOLD_FRAMES - 1);
    expect(b.lastOf("strike")?.strength).toBe("tap");
  });

  it("classifies a long press as a hold", () => {
    const b = new InputBuffer();
    b.press("strike", 10);
    b.release("strike", 10 + HOLD_THRESHOLD_FRAMES);
    expect(b.lastOf("strike")?.strength).toBe("hold");
  });

  it("reports a still-held press as strong once it passes the threshold", () => {
    const b = new InputBuffer();
    b.press("grapple", 100);
    expect(b.strengthOf("grapple", 100 + HOLD_THRESHOLD_FRAMES - 1)).toBe("tap");
    expect(b.strengthOf("grapple", 100 + HOLD_THRESHOLD_FRAMES)).toBe("hold");
  });

  it("ignores repeat presses while an action is already down", () => {
    const b = new InputBuffer();
    b.press("strike", 5);
    b.press("strike", 6);
    expect(b.eventsWithin(0, 100)).toHaveLength(1);
  });

  it("answers whether an action was pressed inside a frame window", () => {
    const b = new InputBuffer();
    b.press("block", 42);
    // The reversal primitive: pressed in the four frames ending on the hit.
    expect(b.pressedWithin("block", 39, 42)).toBe(true);
    expect(b.pressedWithin("block", 43, 46)).toBe(false);
  });

  it("keeps a held press when pruning old history", () => {
    const b = new InputBuffer();
    b.press("run", 1);
    b.press("strike", 2);
    b.release("strike", 3);
    b.prune(10000);
    // The finished strike is dropped; the run is still down so it survives.
    expect(b.lastOf("strike")).toBeNull();
    expect(b.isDown("run")).toBe(true);
  });
});

describe("rng", () => {
  it("produces the same sequence from the same seed", () => {
    const a = new Rng(7);
    const b = new Rng(7);
    const draw = (r: Rng) => Array.from({ length: 50 }, () => r.nextReversalRoll());
    expect(draw(a)).toEqual(draw(b));
  });

  it("produces different sequences from different seeds", () => {
    const a = Array.from({ length: 20 }, ((r) => () => r.nextReversalRoll())(new Rng(1)));
    const b = Array.from({ length: 20 }, ((r) => () => r.nextReversalRoll())(new Rng(2)));
    expect(a).not.toEqual(b);
  });

  it("stays inside 0..999", () => {
    const r = new Rng(99);
    for (let i = 0; i < 5000; i++) {
      const v = r.nextReversalRoll();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1000);
    }
  });

  it("spreads roughly uniformly across the range", () => {
    const r = new Rng(31337);
    const buckets = new Array(10).fill(0);
    const trials = 100000;
    for (let i = 0; i < trials; i++) {
      buckets[Math.floor(r.nextReversalRoll() / 100)]++;
    }
    for (const count of buckets) {
      expect(count / trials).toBeGreaterThan(0.08);
      expect(count / trials).toBeLessThan(0.12);
    }
  });

  it("can be snapshotted and restored mid-sequence", () => {
    const r = new Rng(4242);
    for (let i = 0; i < 10; i++) r.nextReversalRoll();
    const snap = r.snapshot();
    const expected = Array.from({ length: 10 }, () => r.nextReversalRoll());

    r.restore(snap);
    const replayed = Array.from({ length: 10 }, () => r.nextReversalRoll());
    expect(replayed).toEqual(expected);
  });

  it("never gets stuck when seeded with zero", () => {
    const r = new Rng(0);
    const values = new Set(Array.from({ length: 20 }, () => r.nextReversalRoll()));
    expect(values.size).toBeGreaterThan(1);
  });
});
