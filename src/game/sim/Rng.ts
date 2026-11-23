/**
 * Deterministic random source for the match simulation.
 *
 * AKI's reversal check does not roll on demand: it consumes a value that was
 * generated earlier, then immediately generates a replacement (REVERSALS.md
 * steps 4 and 7). Reproducing that ordering matters, because the value a
 * reversal sees depends on how many draws happened before it - which is what
 * makes a whole match replayable from a seed.
 */
export class Rng {
  /** The value a check will consume next. */
  private pending: number;
  private state: number;
  /** Draws taken, for debugging desyncs. */
  private drawCount = 0;

  constructor(seed = 0x2f6e2b1) {
    // Never allow a zero state: xorshift would be stuck at zero forever.
    this.state = seed >>> 0 || 0x2f6e2b1;
    this.pending = this.advance();
  }

  /** xorshift32, chosen for being small, fast and exactly reproducible. */
  private advance(): number {
    let x = this.state;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    this.state = x;
    return x;
  }

  /**
   * Takes the pre-rolled value in the range 0..999 and replaces it, mirroring
   * the console's consume-then-regenerate order.
   */
  nextReversalRoll(): number {
    const value = this.pending % 1000;
    this.pending = this.advance();
    this.drawCount++;
    return value;
  }

  /** Integer in [0, max). */
  nextInt(max: number): number {
    if (max <= 0) return 0;
    const value = this.pending % max;
    this.pending = this.advance();
    this.drawCount++;
    return value;
  }

  get draws(): number {
    return this.drawCount;
  }

  /** Full internal state, so a match can be snapshotted and resumed. */
  snapshot(): { state: number; pending: number; drawCount: number } {
    return { state: this.state, pending: this.pending, drawCount: this.drawCount };
  }

  restore(s: { state: number; pending: number; drawCount: number }): void {
    this.state = s.state;
    this.pending = s.pending;
    this.drawCount = s.drawCount;
  }
}
