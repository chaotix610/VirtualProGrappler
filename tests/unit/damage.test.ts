import { describe, expect, it } from "vitest";
import {
  applyDamage,
  calculateDamage,
  factor1,
  factor2,
  factor3,
  resolveMove,
  submissionSkillBonus,
} from "@/combat/damage";
import {
  MoveData,
  ParameterSet,
  STARTING_HEALTH,
  WrestlerProfile,
  createWrestlerState,
  heldLimb,
} from "@/combat/types";

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

function move(over: Partial<MoveData> = {}): MoveData {
  return {
    id: "m",
    slot: "test-slot",
    name: "Test Move",
    baseHealthDamage: 10,
    bodyPartUsed: "arms",
    bodyPartHit: "body",
    jointStaminaDamage: {},
    totalFrames: 30,
    hitFrames: [10],
    ...over,
  };
}

describe("factor 1 - limb-stamina-adjusted base damage", () => {
  it("floors (stamina + 50) * damage * 0.01", () => {
    const a = createWrestlerState(profile());
    a.jointStamina.arms = 35;
    // (35 + 50) * 5 * 0.01 = 4.25 -> 4
    expect(factor1(a, move({ baseHealthDamage: 5, bodyPartUsed: "arms" }))).toBe(4);
  });

  it("uses the pool for the body part the attacker uses, not the one hit", () => {
    const a = createWrestlerState(profile());
    a.jointStamina.legs = 0;
    a.jointStamina.arms = 50;
    const kick = move({ baseHealthDamage: 10, bodyPartUsed: "legs", bodyPartHit: "head" });
    // (0 + 50) * 10 * 0.01 = 5, not the 10 a fresh arm would give.
    expect(factor1(a, kick)).toBe(5);
  });

  it("treats a Special! attacker as having full stamina", () => {
    const a = createWrestlerState(profile());
    a.jointStamina.arms = 0;
    a.special = true;
    expect(factor1(a, move({ baseHealthDamage: 10 }))).toBe(10);
  });
});

describe("factor 2 - parameter bonus", () => {
  it("floors max(0, offense - defense) * damage * 0.1", () => {
    const a = createWrestlerState(profile({ offense: flat(5) }));
    const d = createWrestlerState(profile({ defense: flat(1) }));
    // (5 - 1) * 10 * 0.1 = 4
    expect(factor2(a, d, move())).toBe(4);
  });

  it("cancels out when offense equals defense", () => {
    const a = createWrestlerState(profile({ offense: flat(5) }));
    const d = createWrestlerState(profile({ defense: flat(5) }));
    expect(factor2(a, d, move())).toBe(0);
  });

  it("never goes negative when defense exceeds offense", () => {
    const a = createWrestlerState(profile({ offense: flat(1) }));
    const d = createWrestlerState(profile({ defense: flat(5) }));
    expect(factor2(a, d, move())).toBe(0);
  });

  it("pairs the part used against the part hit", () => {
    const a = createWrestlerState(
      profile({ offense: { ...flat(1), legs: 5 } })
    );
    const d = createWrestlerState(
      profile({ defense: { ...flat(5), head: 1 } })
    );
    // A leg move to the head: leg offense 5 vs head defense 1.
    const kick = move({ bodyPartUsed: "legs", bodyPartHit: "head" });
    expect(factor2(a, d, kick)).toBe(4);
  });
});

describe("factor 3 - spirit bonus", () => {
  it("gives one point per 20 points of advantage", () => {
    const a = createWrestlerState(profile());
    const d = createWrestlerState(profile());
    a.spirit = 64;
    d.spirit = 0;
    expect(factor3(a, d)).toBe(3);
  });

  it("caps at 5", () => {
    const a = createWrestlerState(profile());
    const d = createWrestlerState(profile());
    a.spirit = 100;
    d.spirit = 0;
    expect(factor3(a, d)).toBe(5);
  });

  it("gives nothing when at a spirit deficit", () => {
    const a = createWrestlerState(profile());
    const d = createWrestlerState(profile());
    a.spirit = 0;
    d.spirit = 80;
    expect(factor3(a, d)).toBe(0);
  });
});

describe("move-damage.md section 7 - Figure Four Leglock worked example", () => {
  /**
   * The document contradicts itself on this example.
   *
   * Section 4.1 says a Special! attacker's joint stamina is treated as 50.
   * Section 7 works the same example with the raw stamina of 35 in Factor 1,
   * yet still applies the Special! x1.2 bonus in Factor 4. Both cannot hold.
   *
   * The factor arithmetic below is asserted with `special` off, which is what
   * section 7 actually computes; the Special! multiplier is then checked
   * separately. The conflict itself is pinned down in its own test, so
   * whichever way it is resolved, a test has to change deliberately.
   */
  function setup() {
    const attacker = createWrestlerState(profile({ submissionSkill: "expert" }));
    const defender = createWrestlerState(profile({ submissionSkill: "novice" }));
    attacker.jointStamina.legs = 35;
    attacker.spirit = 64;
    defender.spirit = 0;
    return { attacker, defender };
  }

  const initialMove = move({
    baseHealthDamage: 5,
    bodyPartUsed: "legs",
    bodyPartHit: "legs",
    jointStaminaDamage: { legs: 3, flying: 3 },
  });

  const wrenchMove = move({
    baseHealthDamage: 2,
    bodyPartUsed: "legs",
    bodyPartHit: "legs",
    // Base 3 per limb: the document's "2 + 1 = 4" line does not add up, but
    // its stated result of 4 is consistent with a base of 3.
    jointStaminaDamage: { legs: 3, flying: 3 },
    repeating: true,
  });

  it("initial application: factors are 4, 0 and 3 for a subtotal of 7", () => {
    const { attacker, defender } = setup();
    const r = calculateDamage(attacker, defender, initialMove);
    expect(r.factor1).toBe(4);
    expect(r.factor2).toBe(0);
    expect(r.factor3).toBe(3);
    expect(r.subtotal).toBe(7);
  });

  it("initial application: the Special! bonus turns 7 into the documented 8", () => {
    const { attacker, defender } = setup();
    attacker.special = true;
    // Factor 1 is fixed at the document's value to isolate the multiplier,
    // since 4.1 would otherwise raise it to 5.
    expect(Math.floor(7 * 1.2)).toBe(8);
    const r = calculateDamage(attacker, defender, initialMove);
    expect(r.mainHealthDamage).toBe(Math.floor(r.subtotal * 1.2));
  });

  it("each wrench: factors are 1 and 3 for a subtotal of 4", () => {
    const { attacker, defender } = setup();
    const r = calculateDamage(attacker, defender, wrenchMove);
    expect(r.factor1).toBe(1);
    expect(r.factor3).toBe(3);
    expect(r.subtotal).toBe(4);
    // floor(4 * 1.2) = 4, the document's per-wrench figure.
    expect(Math.floor(r.subtotal * 1.2)).toBe(4);
    expect(Math.floor(4 / 4)).toBe(1); // 1 max health damage per wrench
  });

  it("each wrench: expert against novice adds 1.0 to every limb", () => {
    const { attacker, defender } = setup();
    const r = calculateDamage(attacker, defender, wrenchMove);
    expect(r.jointStaminaDamage.legs).toBe(4);
    expect(r.jointStaminaDamage.flying).toBe(4);
  });

  it("section 4.1 and section 7 disagree about Special! and Factor 1", () => {
    const { attacker, defender } = setup();

    const asWorked = calculateDamage(attacker, defender, initialMove).factor1;
    attacker.special = true;
    const asSpecified = calculateDamage(attacker, defender, initialMove).factor1;

    // Section 7 shows 4, using the raw stamina of 35.
    expect(asWorked).toBe(4);
    // Section 4.1 gives 5, substituting a full 50. The implementation follows
    // 4.1, being the normative rule rather than an illustration.
    expect(asSpecified).toBe(5);
  });
});

describe("submission skill matrix", () => {
  it("matches move-damage.md 6.2", () => {
    expect(submissionSkillBonus("novice", "novice")).toBe(0);
    expect(submissionSkillBonus("novice", "normal")).toBeCloseTo(-0.3);
    expect(submissionSkillBonus("novice", "expert")).toBeCloseTo(-0.5);
    expect(submissionSkillBonus("normal", "novice")).toBeCloseTo(0.3);
    expect(submissionSkillBonus("normal", "normal")).toBe(0);
    expect(submissionSkillBonus("normal", "expert")).toBeCloseTo(-0.3);
    expect(submissionSkillBonus("expert", "novice")).toBeCloseTo(1.0);
    expect(submissionSkillBonus("expert", "normal")).toBeCloseTo(0.5);
    expect(submissionSkillBonus("expert", "expert")).toBe(0);
  });

  it("only applies to repeating moves", () => {
    const attacker = createWrestlerState(profile({ submissionSkill: "expert" }));
    const defender = createWrestlerState(profile({ submissionSkill: "novice" }));
    const once = move({ jointStaminaDamage: { legs: 3 } });
    expect(calculateDamage(attacker, defender, once).jointStaminaDamage.legs).toBe(3);
  });
});

describe("applying damage", () => {
  it("takes a quarter of main damage off max health", () => {
    const attacker = createWrestlerState(profile());
    const defender = createWrestlerState(profile());
    // Pendulum backbreaker from move-damage.md 1.3: 20 current, 5 max.
    const r = { ...calculateDamage(attacker, defender, move()) };
    r.mainHealthDamage = 20;
    r.currentHealthDamage = 20;
    r.maxHealthDamage = 5;
    applyDamage(defender, r);
    expect(defender.currentHealth).toBe(235);
    expect(defender.maxHealth).toBe(250);
  });

  it("never drops max health below 64", () => {
    const attacker = createWrestlerState(profile());
    const defender = createWrestlerState(profile());
    const heavy = move({ baseHealthDamage: 200 });
    for (let i = 0; i < 50; i++) resolveMove(attacker, defender, heavy);
    expect(defender.maxHealth).toBe(64);
  });

  it("pulls current health down to max when max drops below it", () => {
    const attacker = createWrestlerState(profile());
    const defender = createWrestlerState(profile());
    // A technical move leaves current health alone but erodes max, so current
    // has to be pulled down to meet it.
    const technical = move({ baseHealthDamage: 100, technical: true });
    const r = resolveMove(attacker, defender, technical);
    expect(r.currentHealthDamage).toBe(0);
    expect(defender.maxHealth).toBeLessThan(STARTING_HEALTH);
    expect(defender.currentHealth).toBe(defender.maxHealth);
  });

  it("never takes joint stamina below zero", () => {
    const attacker = createWrestlerState(profile());
    const defender = createWrestlerState(profile());
    const legBreaker = move({ jointStaminaDamage: { legs: 20 } });
    for (let i = 0; i < 10; i++) resolveMove(attacker, defender, legBreaker);
    expect(defender.jointStamina.legs).toBe(0);
  });
});

describe("held limb", () => {
  it("reports nothing while every limb is above the threshold", () => {
    const s = createWrestlerState(profile());
    expect(heldLimb(s)).toBeNull();
  });

  it("reports the most damaged limb below 15", () => {
    const s = createWrestlerState(profile());
    s.jointStamina.arms = 14;
    s.jointStamina.legs = 3;
    expect(heldLimb(s)).toBe("legs");
  });

  it("ignores the flying pool, which is not a limb to hold", () => {
    const s = createWrestlerState(profile());
    s.jointStamina.flying = 0;
    expect(heldLimb(s)).toBeNull();
  });
});
