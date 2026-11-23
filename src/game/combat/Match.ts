import { Rng } from "../sim/Rng";
import { DamageBreakdown, resolveMove } from "./damage";
import {
  BodyPart,
  MoveData,
  WrestlerProfile,
  WrestlerState,
  createWrestlerState,
  heldLimb,
} from "./types";

export type Side = "player" | "opponent";

/** One wrestler's readable state, for the debug overlay. */
export interface FighterSnapshot {
  name: string;
  currentHealth: number;
  maxHealth: number;
  spirit: number;
  special: boolean;
  jointStamina: Record<BodyPart, number>;
  /** Limb the wrestler is visibly holding, if any. */
  holding: BodyPart | null;
}

export interface MatchSnapshot {
  player: FighterSnapshot;
  opponent: FighterSnapshot;
  last: ExchangeLog | null;
  history: ExchangeLog[];
  draws: number;
}

/** A strike that has been thrown and is waiting on its hit frame. */
interface PendingHit {
  attacker: Side;
  move: MoveData;
  /** Simulation frame the move connects on. */
  landsOnFrame: number;
}

/** Record of the last exchange, for the debug overlay. */
export interface ExchangeLog {
  frame: number;
  attacker: Side;
  moveName: string;
  connected: boolean;
  /** Why it missed, when it did. */
  missReason?: string;
  breakdown?: DamageBreakdown;
}

/**
 * Owns both wrestlers' combat state and advances it on the fixed simulation
 * clock.
 *
 * Strikes are not resolved when the button is pressed: they are scheduled to
 * land on a specific simulation frame, which is what makes hit frames and
 * reversal windows meaningful, and what a reversal will later be judged
 * against.
 */
export class Match {
  readonly rng: Rng;
  readonly player: WrestlerState;
  readonly opponent: WrestlerState;

  private pending: PendingHit[] = [];
  private log: ExchangeLog[] = [];

  /**
   * Answers whether an attack can reach right now. Supplied by the scene,
   * since range depends on where the two wrestlers are standing.
   */
  canConnect: ((attacker: Side, move: MoveData) => boolean) | null = null;

  constructor(
    playerProfile: WrestlerProfile,
    opponentProfile: WrestlerProfile,
    seed = 0x2f6e2b1
  ) {
    this.rng = new Rng(seed);
    this.player = createWrestlerState(playerProfile);
    this.opponent = createWrestlerState(opponentProfile);
  }

  stateOf(side: Side): WrestlerState {
    return side === "player" ? this.player : this.opponent;
  }

  private other(side: Side): Side {
    return side === "player" ? "opponent" : "player";
  }

  /** Throws a move, to land on its hit frame rather than immediately. */
  throwMove(attacker: Side, move: MoveData, currentFrame: number): void {
    const hitFrame = move.hitFrames[0] ?? 0;
    this.pending.push({
      attacker,
      move,
      landsOnFrame: currentFrame + hitFrame,
    });
  }

  /** Advances one simulation frame, resolving anything due to land. */
  step(frame: number): void {
    if (!this.pending.length) return;

    const due = this.pending.filter((p) => p.landsOnFrame <= frame);
    if (!due.length) return;
    this.pending = this.pending.filter((p) => p.landsOnFrame > frame);

    for (const hit of due) {
      this.resolve(hit, frame);
    }
  }

  private resolve(hit: PendingHit, frame: number): void {
    const defenderSide = this.other(hit.attacker);
    const attacker = this.stateOf(hit.attacker);
    const defender = this.stateOf(defenderSide);

    const reachable = this.canConnect
      ? this.canConnect(hit.attacker, hit.move)
      : true;

    if (!reachable) {
      this.record({
        frame,
        attacker: hit.attacker,
        moveName: hit.move.name,
        connected: false,
        missReason: "out of range",
      });
      return;
    }

    const breakdown = resolveMove(attacker, defender, hit.move);
    this.record({
      frame,
      attacker: hit.attacker,
      moveName: hit.move.name,
      connected: true,
      breakdown,
    });
  }

  private record(entry: ExchangeLog): void {
    this.log.push(entry);
    // A short tail is all the overlay shows.
    if (this.log.length > 8) this.log.shift();
  }

  get lastExchange(): ExchangeLog | null {
    return this.log.length ? this.log[this.log.length - 1] : null;
  }

  get history(): ExchangeLog[] {
    return [...this.log].reverse();
  }

  /** Plain snapshot for the debug overlay. */
  snapshot(): MatchSnapshot {
    const side = (s: WrestlerState): FighterSnapshot => ({
      name: s.profile.name,
      currentHealth: Math.round(s.currentHealth),
      maxHealth: Math.round(s.maxHealth),
      spirit: s.spirit,
      special: s.special,
      jointStamina: { ...s.jointStamina },
      holding: heldLimb(s),
    });
    return {
      player: side(this.player),
      opponent: side(this.opponent),
      last: this.lastExchange,
      history: this.history,
      draws: this.rng.draws,
    };
  }
}
