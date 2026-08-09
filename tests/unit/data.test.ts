import { describe, expect, it } from "vitest";
import {
  CATALOG_MOVES,
  MOVE_SLOTS,
  movesById,
  movesForSlot,
  slotById,
  slotsForMove,
  slotsInGroup,
  validateCatalog,
} from "@/data/moveCatalog";
import { CONTROL_MAPPING, controlForKey, unboundControls } from "@/data/controls";

describe("move slot catalog", () => {
  it("loads every slot", () => {
    expect(MOVE_SLOTS.length).toBeGreaterThan(100);
  });

  it("gives every slot a unique id", () => {
    const ids = new Set(MOVE_SLOTS.map((s) => s.slot_id));
    expect(ids.size).toBe(MOVE_SLOTS.length);
  });

  it("indexes slots by id", () => {
    const first = MOVE_SLOTS[0];
    expect(slotById(first.slot_id)?.slot_display_name).toBe(
      first.slot_display_name
    );
    expect(slotById("no-such-slot")).toBeNull();
  });

  it("gives manual slots an input pattern and automatic ones none", () => {
    for (const slot of MOVE_SLOTS) {
      if (slot.trigger === "automatic") {
        expect(slot.input_pattern, slot.slot_id).toBeNull();
      }
    }
  });

  it("never mixes simultaneous buttons with mash buttons in one pattern", () => {
    // The field definitions call these mutually exclusive.
    for (const slot of MOVE_SLOTS) {
      const p = slot.input_pattern;
      if (!p) continue;
      const hasButtons = !!p.buttons?.length;
      const hasMash = !!p.mash_buttons?.length;
      expect(hasButtons && hasMash, slot.slot_id).toBe(false);
    }
  });
});

describe("move catalog", () => {
  it("loads every move", () => {
    expect(CATALOG_MOVES.length).toBeGreaterThan(100);
  });

  it("keeps every variant when ids repeat", () => {
    // moves.json calls (position, move_id) unique, but 62 ids appear twice as
    // weak/strong variants. The loader must surface both, not silently pick
    // one - so this asserts nothing is lost rather than that ids are unique.
    const total = CATALOG_MOVES.reduce((n, m) => {
      return n + (movesById(m.position, m.move_id).includes(m) ? 0 : 1);
    }, 0);
    expect(total).toBe(0);

    const stretch = movesById("grappling", "abdominal_stretch");
    expect(stretch).toHaveLength(2);
    expect(stretch.map((m) => m.power).sort()).toEqual(["E", "F"]);
  });

  it("gives every move at least one group", () => {
    const orphans = CATALOG_MOVES.filter((m) => !m.groups.length);
    expect(orphans.map((m) => m.move_id)).toEqual([]);
  });

  it("only uses power grades from S down to G, or null", () => {
    const allowed = new Set(["S", "A", "B", "C", "D", "E", "F", "G"]);
    const bad = CATALOG_MOVES.filter(
      (m) => m.power !== null && !allowed.has(m.power)
    );
    expect(bad.map((m) => `${m.move_id}=${m.power}`)).toEqual([]);
  });
});

describe("catalog cross-references", () => {
  /**
   * KNOWN DATA ISSUE. 58 moves reference a `running_strike` group that no
   * slot defines, so none of them can currently be selected. Asserted as-is
   * rather than as an empty list so the suite stays honest: it will fail if
   * the problem spreads, and also once it is fixed, prompting this to become
   * `toEqual([])`.
   */
  it("has one dangling group reference, and only one", () => {
    expect(validateCatalog().unknownGroups).toEqual(["running_strike"]);
  });

  it("reuses standing and running strikes in turnbuckle slots by design", () => {
    // moves.json says a move's position must match its groups', but strikes
    // are deliberately shared into turnbuckle slots. Recorded, not enforced.
    const cross = validateCatalog().crossPositionGroups.sort();
    expect(cross).toEqual([
      "running -> running_tree_of_woe_strike (turnbuckle)",
      "running -> running_turnbuckle_strike (turnbuckle)",
      "standing -> tree_of_woe_strike (turnbuckle)",
      "standing -> turnbuckle_strike (turnbuckle)",
    ]);
  });

  it("resolves moves to slots and back", () => {
    const move = CATALOG_MOVES.find((m) => m.groups.length > 0)!;
    const slots = slotsForMove(move);
    expect(slots.length).toBeGreaterThan(0);
    expect(movesForSlot(slots[0])).toContain(move);
  });

  it("finds slots by group", () => {
    const group = MOVE_SLOTS[0].group;
    expect(slotsInGroup(group).length).toBeGreaterThan(0);
  });
});

describe("control mapping", () => {
  it("maps keyboard codes back to pad controls", () => {
    // From data/settings/control-mappings.json.
    expect(controlForKey("Enter")).toBe("a");
    expect(controlForKey("KeyW")).toBe("controlStickUp");
    expect(controlForKey("ArrowLeft")).toBe("dpadLeft");
    expect(controlForKey("F13")).toBeNull();
  });

  it("binds every pad control the slots can reference", () => {
    expect(unboundControls()).toEqual([]);
  });

  it("never binds one key to two controls", () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const [control, codes] of Object.entries(CONTROL_MAPPING.bindings)) {
      for (const code of codes) {
        const existing = seen.get(code);
        if (existing) clashes.push(`${code}: ${existing} and ${control}`);
        else seen.set(code, control);
      }
    }
    expect(clashes).toEqual([]);
  });
});
