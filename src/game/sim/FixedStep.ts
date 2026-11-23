/**
 * Fixed-timestep driver for the match simulation.
 *
 * The renderer runs at whatever rate the display allows, but the simulation
 * has to advance in equal, countable frames: the HSFM blueprint identifies
 * moves, reversal windows and hit frames by frame index, and those numbers
 * only mean anything if every frame is the same length. It also makes a match
 * reproducible from a seed plus an input log.
 */
export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;

/**
 * Ceiling on how many simulation steps one rendered frame may run.
 *
 * Without it, a long stall (an alt-tab, a slow asset load) would hand over a
 * huge delta and the catch-up loop would run for so long that it stalls
 * again, spiralling. Dropping the excess keeps the sim responsive; it falls
 * behind wall-clock rather than locking up.
 */
const MAX_STEPS_PER_FRAME = 5;

export class FixedStep {
  private accumulator = 0;
  private frameIndex = 0;

  /** Simulation frames elapsed since the opening bell. */
  get frame(): number {
    return this.frameIndex;
  }

  /**
   * Feeds in wall-clock time and runs `step` once per whole simulation frame
   * it covers. Returns how many steps ran.
   */
  advance(deltaSeconds: number, step: (frame: number) => void): number {
    this.accumulator += deltaSeconds;

    let steps = 0;
    while (this.accumulator >= SIM_DT && steps < MAX_STEPS_PER_FRAME) {
      this.accumulator -= SIM_DT;
      this.frameIndex++;
      step(this.frameIndex);
      steps++;
    }

    // Discard any backlog beyond the cap rather than carrying it forward.
    if (this.accumulator > SIM_DT * MAX_STEPS_PER_FRAME) {
      this.accumulator = 0;
    }

    return steps;
  }

  /** How far the render sits between simulation frames, 0..1. */
  get alpha(): number {
    return this.accumulator / SIM_DT;
  }

  reset(): void {
    this.accumulator = 0;
    this.frameIndex = 0;
  }
}
