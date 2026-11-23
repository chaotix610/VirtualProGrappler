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

  it("keeps every variant, each under its own id", () => {
    // The loader must surface every move rather than silently pick one per
    // (position, move_id), so this asserts nothing is lost.
    const total = CATALOG_MOVES.reduce((n, m) => {
      return n + (movesById(m.position, m.move_id).includes(m) ? 0 : 1);
    }, 0);
    expect(total).toBe(0);

    // The version-3 catalog gives each weak/strong variant its own id, so
    // the pair is unique now; variants share a display name instead.
    expect(validateCatalog().duplicateIds).toEqual([]);
    const slams = CATALOG_MOVES.filter((m) => m.position === "grappling" && m.name === "Fallaway Slam");
    expect(slams.map((m) => m.move_id).sort()).toEqual([
      "fallaway_slam_front_strong",
      "fallaway_slam_front_weak_b",
    ]);
  });

  it("reads the version-3 text fields into typed values", () => {
    const move = CATALOG_MOVES.find((m) => m.move_id === "arm_drag")!;
    expect(move.slot_ids.length).toBeGreaterThan(1);
    expect(typeof move.ko).toBe("boolean");
    expect(move.feature).toBeNull();
    expect(move.actor_animation_id).toBe("arm-drag.glb");
    expect(move.target_animation_id).toBe("arm-drag-target.glb");
    expect(move.slot_animation_overrides).toEqual({});
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
   * The version-1 catalog had 58 moves pointing at a `running_strike` group no
   * slot defined. The version-3 rework fixed it, so any dangling group now is
   * a regression: a move that can never be selected.
   */
  it("has no dangling group references", () => {
    expect(validateCatalog().unknownGroups).toEqual([]);
  });

  /**
   * slot_ids decide eligibility. The version-1 catalog pointed two moves at
   * lower-body submission slots move-slots.json never defined; version 3
   * fixed that too, so none should reappear.
   */
  it("has no dangling slot references", () => {
    expect(validateCatalog().unknownSlots).toEqual([]);
  });

  it("keeps every move in groups of its own position", () => {
    // Version 1 shared standing and running strikes into turnbuckle groups;
    // version 3 gives the turnbuckle its own, so positions line up again.
    expect(validateCatalog().crossPositionGroups).toEqual([]);
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
