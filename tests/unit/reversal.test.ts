import { describe, expect, it } from "vitest";
import { Rng } from "@/sim/Rng";
import {
  reversalOdds,
  rollReversal,
  spiritBandProbability,
  weightAdvantage,
} from "@/combat/reversal";
import { ParameterSet, WrestlerProfile, createWrestlerState } from "@/combat/types";

const flat = (n: number): ParameterSet => ({
  head: n,
  body: n,
  arms: n,
  legs: n,
  flying: n,
});

function profile(over: Partial<WrestlerProfile> = {}): WrestlerProfile {
  return {
    id: "test",
    name: "Test",
    offense: flat(3),
    defense: flat(3),
    weightFactor: 5,
    submissionSkill: "normal",
    ...over,
  };
}

describe("spirit band probability", () => {
  it("matches the REVERSALS.md table", () => {
    expect(spiritBandProbability(100)).toBe(500); // 50%
    expect(spiritBandProbability(99)).toBe(333); // 33.3%
    expect(spiritBandProbability(81)).toBe(333);
    expect(spiritBandProbability(80)).toBe(250); // 25%
    expect(spiritBandProbability(61)).toBe(250);
    expect(spiritBandProbability(60)).toBe(125); // 12.5%
    expect(spiritBandProbability(31)).toBe(125);
    expect(spiritBandProbability(30)).toBe(62); // 6.2%
    expect(spiritBandProbability(11)).toBe(62);
    expect(spiritBandProbability(10)).toBe(31); // 3.1%
    expect(spiritBandProbability(0)).toBe(31);
  });
});

describe("weight factor", () => {
  it("compares whole bands of three", () => {
    // Most wrestlers sit at 5, which is band 1, so they cancel out.
    expect(weightAdvantage(5, 5)).toBe(0);
    // A heavyweight at 7 is still band 2 against band 1.
    expect(weightAdvantage(5, 7)).toBe(1);
    // Lightweights are penalised: band 0 defender against band 1 attacker.
    expect(weightAdvantage(5, 1)).toBe(-1);
  });
});

describe("REVERSALS.md - Dragon Kid vs Magnum TOKYO worked example", () => {
  it("doubles a 25% chance to 50% on the weight difference", () => {
    // Dragon Kid (weight 1) grabs Magnum TOKYO (weight 4).
    const attacker = createWrestlerState(profile({ weightFactor: 1 }));
    const defender = createWrestlerState(profile({ weightFactor: 4 }));
    defender.spirit = 70; // 61-80 band -> 250, i.e. 25%

    const odds = reversalOdds({ attacker, defender, strongGrapple: false });
    expect(odds.base).toBe(250);
    // 4/3 = 1, 1/3 = 0, difference 1 -> doubled.
    expect(odds.probability).toBe(500);
  });
});

describe("strong grapple health scaling", () => {
  function setup(health: number) {
    const attacker = createWrestlerState(profile());
    const defender = createWrestlerState(profile());
    defender.spirit = 0; // band -> 31
    defender.currentHealth = health;
    return { attacker, defender };
  }

  it("quadruples against a fresh defender at 75% health or better", () => {
    const { attacker, defender } = setup(192);
    const odds = reversalOdds({ attacker, defender, strongGrapple: true });
    expect(odds.base).toBe(31);
    expect(odds.probability).toBe(124);
  });

  it("doubles between 50% and 75% health", () => {
    const { attacker, defender } = setup(128);
    expect(reversalOdds({ attacker, defender, strongGrapple: true }).probability).toBe(62);
  });

  it("gives no multiplier below 50% health", () => {
    const { attacker, defender } = setup(127);
    expect(reversalOdds({ attacker, defender, strongGrapple: true }).probability).toBe(31);
  });

  it("does not apply to weak grapples", () => {
    const { attacker, defender } = setup(255);
    expect(reversalOdds({ attacker, defender, strongGrapple: false }).probability).toBe(31);
  });

  it("measures a Special! defender against max health, not current", () => {
    const { attacker, defender } = setup(10);
    defender.special = true;
    defender.maxHealth = 255;
    // Current health of 10 would give no multiplier; max health of 255 gives x4.
    expect(reversalOdds({ attacker, defender, strongGrapple: true }).probability).toBe(124);
  });
});

describe("Special! rules", () => {
  it("disables reversals when only the attacker is in Special!", () => {
    const attacker = createWrestlerState(profile());
    const defender = createWrestlerState(profile());
    attacker.special = true;
    defender.spirit = 100;

    const odds = reversalOdds({ attacker, defender, strongGrapple: false });
    expect(odds.disabled).toBe(true);
    expect(odds.probability).toBe(0);
  });

  it("applies normal odds when both are in Special!", () => {
    const attacker = createWrestlerState(profile());
    const defender = createWrestlerState(profile());
    attacker.special = true;
    defender.special = true;
    defender.spirit = 100;

    const odds = reversalOdds({ attacker, defender, strongGrapple: false });
    expect(odds.disabled).toBe(false);
    expect(odds.probability).toBe(500);
  });
});

describe("probability cap", () => {
  it("never exceeds 1000", () => {
    const attacker = createWrestlerState(profile({ weightFactor: 0 }));
    const defender = createWrestlerState(profile({ weightFactor: 7 }));
    defender.spirit = 100; // 500
    defender.currentHealth = 255; // strong grapple x4
    // 500 x2 x4 = 4000, capped.
    const odds = reversalOdds({ attacker, defender, strongGrapple: true });
    expect(odds.probability).toBe(1000);
  });
});

describe("rolling", () => {
  it("reverses when the roll lands under the probability", () => {
    const attacker = createWrestlerState(profile());
    const defender = createWrestlerState(profile());
    defender.spirit = 100; // 500

    // Sample enough rolls that the observed rate can be compared to 50%.
    const rng = new Rng(12345);
    let reversed = 0;
    const trials = 20000;
    for (let i = 0; i < trials; i++) {
      if (rollReversal({ attacker, defender, strongGrapple: false }, rng).reversed) {
        reversed++;
      }
    }
    expect(reversed / trials).toBeGreaterThan(0.45);
    expect(reversed / trials).toBeLessThan(0.55);
  });

  it("consumes a roll even when reversals are disabled, keeping the sequence aligned", () => {
    const attacker = createWrestlerState(profile());
    const defender = createWrestlerState(profile());
    attacker.special = true;

    const rng = new Rng(999);
    const before = rng.draws;
    const result = rollReversal({ attacker, defender, strongGrapple: false }, rng);
    expect(result.reversed).toBe(false);
    expect(rng.draws).toBe(before + 1);
  });

  it("is reproducible from a seed", () => {
    const attacker = createWrestlerState(profile());
    const defender = createWrestlerState(profile());
    defender.spirit = 50;

    const run = () => {
      const rng = new Rng(2024);
      return Array.from({ length: 40 }, () =>
        rollReversal({ attacker, defender, strongGrapple: false }, rng).reversed
      );
    };
    expect(run()).toEqual(run());
  });
});
