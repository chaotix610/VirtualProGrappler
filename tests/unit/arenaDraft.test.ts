import { describe, expect, it } from "vitest";
import { ArenaData, arenaById, arenaParts } from "@/data/arenas";
import {
  ArenaDraft,
  cloneArena,
  draftFromArena,
  draftToArenaData,
  draftToJson,
  existingIds,
  idProblem,
  isColorKey,
  pieceOptions,
  selectStage,
  texturesForSlot,
  unknownKeys,
} from "@/data/arenaDraft";
import { TEXTURE_SLOTS, colorTargets, slotById } from "@/data/textureSlots";
import { availableStages, stageById } from "@/data/stages";

const base = (over: Partial<ArenaDraft> = {}): ArenaDraft => ({
  id: "test_arena",
  displayName: "Test Arena",
  previewImage: "",
  stage: "raw_is_war",
  floor: "assets/glb/arena/floor/arena_floor.glb",
  barricade: "assets/glb/arena/barricade/barricade.glb",
  outer: "assets/glb/arena/outer/arena_outer.glb",
  arenaTextures: {},
  ringTextures: {},
  ...over,
});

describe("id validation", () => {
  it("accepts the shape the schema requires", () => {
    expect(idProblem("raw", [])).toBeNull();
    expect(idProblem("royal_rumble2", [])).toBeNull();
  });

  it("rejects ids the filename could not carry", () => {
    expect(idProblem("", [])).toMatch(/required/);
    expect(idProblem("Raw", [])).toMatch(/lowercase/);
    expect(idProblem("2raw", [])).toMatch(/lowercase/);
    expect(idProblem("raw-is-war", [])).toMatch(/lowercase/);
    expect(idProblem("raw is war", [])).toMatch(/lowercase/);
  });

  it("rejects an id that is already taken", () => {
    expect(idProblem("raw", ["raw", "smackdown"])).toMatch(/already exists/);
  });

  it("allows an id to keep its own name when editing", () => {
    // The caller filters the arena being edited out of `taken`, which is what
    // lets a save of an unrenamed arena through.
    const taken = existingIds().filter((id) => id !== "raw");
    expect(idProblem("raw", taken)).toBeNull();
  });
});

describe("colour keys", () => {
  it("separates colours from texture paths", () => {
    expect(isColorKey("ropeColor")).toBe(true);
    expect(isColorKey("turnbuckleBoltCoverColor")).toBe(true);
    expect(isColorKey("mat_canvas")).toBe(false);
  });
});

describe("round-tripping a real arena", () => {
  it("survives arena -> draft -> json unchanged", () => {
    const raw = arenaById("raw")!;
    const out = draftToJson(draftFromArena(raw));

    expect(out.id).toBe(raw.id);
    expect(out.displayName).toBe(raw.displayName);
    expect(out.previewImage).toBe(raw.previewImage);
    expect(out.stage).toBe(raw.stage);
    expect(out.floor).toBe(raw.floor);
    expect(out.barricade).toBe(raw.barricade);
    expect(out.outer).toBe(raw.outer);
    expect(out.arenaTextures).toEqual(raw.arenaTextures);
    expect(out.ringTextures).toEqual(raw.ringTextures);
  });

  it("round-trips every bundled arena without changing its parts", () => {
    for (const id of existingIds()) {
      const arena = arenaById(id)!;
      const out = draftToJson(draftFromArena(arena));
      expect(
        { id, parts: arenaParts(out) },
        `${id} changed shape through the editor`
      ).toEqual({ id, parts: arenaParts(arena) });
    }
  });
});

describe("stage selection", () => {
  it("loads the stage's own pieces when the arena names none", () => {
    const stage = availableStages()[0];
    const draft = draftFromArena({
      id: "x",
      displayName: "X",
      stage: stage.id,
    });
    expect(draft.floor).toBe(stage.floors[0]);
    expect(draft.barricade).toBe(stage.barricades[0]);
    expect(draft.outer).toBe(stage.outers[0]);
  });

  it("re-picks every piece when the stage changes", () => {
    const draft = base();
    selectStage(draft, "royal_rumble");

    const stage = stageById("royal_rumble")!;
    expect(draft.stage).toBe("royal_rumble");
    expect(draft.floor).toBe(stage.floors[0]);
    expect(draft.barricade).toBe(stage.barricades[0]);
    expect(draft.outer).toBe(stage.outers[0]);
  });

  it("offers only the pieces the chosen stage lists", () => {
    const draft = base({ stage: "royal_rumble" });
    const stage = stageById("royal_rumble")!;
    expect(pieceOptions(draft, "floor")).toEqual(stage.floors);
    // A piece from the other set does not fit this stage's geometry.
    expect(pieceOptions(draft, "floor")).not.toContain(
      "assets/glb/arena/floor/arena_floor.glb"
    );
  });

  it("replaces a piece that does not fit the stage it is paired with", () => {
    // What a hand-edited file could carry: RAW's floor under the Rumble stage.
    const draft = draftFromArena({
      id: "x",
      displayName: "X",
      stage: "royal_rumble",
      floor: "assets/glb/arena/floor/arena_floor.glb",
    });
    expect(draft.floor).toBe(stageById("royal_rumble")!.floors[0]);
  });

  it("infers a stage from a legacy arenaParts list", () => {
    const draft = draftFromArena({
      id: "x",
      displayName: "X",
      arenaParts: [
        "assets/glb/arena/floor/royal_rumble_floor.glb",
        "assets/glb/arena/stage/royal_rumble_stage.glb",
      ],
    });
    expect(draft.stage).toBe("royal_rumble");
  });
});

describe("serialising a draft", () => {
  it("writes the stage and its three pieces", () => {
    const out = draftToJson(base());
    expect(out.stage).toBe("raw_is_war");
    expect(out.floor).toBe("assets/glb/arena/floor/arena_floor.glb");
    expect(out).not.toHaveProperty("arenaParts");
  });

  it("omits empty optional fields instead of writing blanks", () => {
    const out = draftToJson(base());
    expect(out).not.toHaveProperty("previewImage");
    expect(out).not.toHaveProperty("arenaTextures");
    expect(out).not.toHaveProperty("ringTextures");
  });

  it("drops blank texture values, which would resolve to nothing", () => {
    const out = draftToJson(
      base({
        arenaTextures: { mat_floor_ringside: "floor.png", mat_ceiling_banners: "  " },
      })
    );
    expect(out.arenaTextures).toEqual({ mat_floor_ringside: "floor.png" });
  });

  it("drops keys no slot owns, so stage materials do not linger", () => {
    const out = draftToJson(
      base({
        arenaTextures: {
          mat_floor_ringside: "floor.png",
          // Baked into the stage GLB now - the editor cannot reach it.
          mat_large_curtain: "curtain.png",
        },
      })
    );
    expect(out.arenaTextures).toEqual({ mat_floor_ringside: "floor.png" });
  });

  it("reports the keys it would drop before a save removes them", () => {
    const draft = base({ arenaTextures: { mat_large_curtain: "curtain.png" } });
    expect(unknownKeys(draft)).toEqual(["mat_large_curtain"]);
  });
});

describe("legacy rope colour", () => {
  it("expands the shared key into one colour per rope", () => {
    const draft = draftFromArena({
      id: "x",
      displayName: "X",
      stage: "raw_is_war",
      ringTextures: { ropeColor: "rgba(255, 0, 0, 0.4)" },
    });

    expect(draft.ringTextures).not.toHaveProperty("ropeColor");
    expect(draft.ringTextures.ropeTopColor).toBe("rgba(255, 0, 0, 0.4)");
    expect(draft.ringTextures.ropeMiddleColor).toBe("rgba(255, 0, 0, 0.4)");
    expect(draft.ringTextures.ropeBottomColor).toBe("rgba(255, 0, 0, 0.4)");
  });

  it("keeps a per-rope colour that was already set, being more specific", () => {
    const draft = draftFromArena({
      id: "x",
      displayName: "X",
      stage: "raw_is_war",
      ringTextures: {
        ropeColor: "rgba(255, 0, 0, 0.4)",
        ropeTopColor: "rgba(0, 0, 255, 0.4)",
      },
    });
    expect(draft.ringTextures.ropeTopColor).toBe("rgba(0, 0, 255, 0.4)");
    expect(draft.ringTextures.ropeBottomColor).toBe("rgba(255, 0, 0, 0.4)");
  });
});

describe("texture slots", () => {
  it("offers only art from the slot's own folders", () => {
    const canvas = slotById("canvas")!;
    const options = texturesForSlot(canvas);

    expect(options.length).toBeGreaterThan(0);
    for (const path of options) {
      expect(path.startsWith("assets/textures/ring/canvas/"), path).toBe(true);
    }
  });

  it("hides work-in-progress art from the pickers", () => {
    const options = texturesForSlot(slotById("canvas")!);
    expect(options.filter((p) => p.includes("/_wip/"))).toEqual([]);
  });

  it("lets the barricade wear the ringside matting as well as its own art", () => {
    const options = texturesForSlot(slotById("barricade")!);
    expect(options).toContain(
      "assets/textures/arena/floor_ringside/floor_mat_1_double.png"
    );
    expect(options).toContain(
      "assets/textures/arena/barricade/barricade_2.png"
    );
  });

  it("gives every slot with a picker something to pick", () => {
    const empty = TEXTURE_SLOTS.filter(
      (slot) => slot.folders.length && !texturesForSlot(slot).length
    );
    expect(empty.map((slot) => slot.id)).toEqual([]);
  });

  it("gives a colour-only slot no texture options", () => {
    expect(texturesForSlot(slotById("ring_steps")!)).toEqual([]);
    expect(slotById("ring_steps")!.materials).toEqual([]);
  });

  it("maps every colour key to materials the renderer can find", () => {
    for (const slot of TEXTURE_SLOTS) {
      for (const color of slot.colors) {
        expect(colorTargets(color.key), color.key).toEqual(color.materials);
      }
    }
  });

  it("still honours the legacy shared rope colour", () => {
    expect(colorTargets("ropeColor")).toEqual([
      "mat_rope_top",
      "mat_rope_middle",
      "mat_rope_bottom",
    ]);
  });
});

describe("cloning", () => {
  const source = (): ArenaData => arenaById("raw")!;

  it("copies the stage, pieces and textures of its source", () => {
    const clone = cloneArena(source(), "new_arena", "New Arena");
    const from = draftFromArena(source());
    expect(clone.stage).toBe(from.stage);
    expect(clone.floor).toBe(from.floor);
    expect(clone.barricade).toBe(from.barricade);
    expect(clone.outer).toBe(from.outer);
    expect(clone.arenaTextures).toEqual(source().arenaTextures);
  });

  it("takes the new id and name", () => {
    const clone = cloneArena(source(), "new_arena", "New Arena");
    expect(clone.id).toBe("new_arena");
    expect(clone.displayName).toBe("New Arena");
  });

  it("drops the preview, which belongs to the arena it came from", () => {
    const clone = cloneArena(source(), "new_arena", "New Arena");
    expect(clone.previewImage).toBe("");
    expect(draftToJson(clone)).not.toHaveProperty("previewImage");
  });

  it("does not alias its source's nested data", () => {
    const original = source();
    const clone = cloneArena(original, "new_arena", "New Arena");
    clone.arenaTextures.mat_new = "x.png";
    selectStage(clone, "royal_rumble");

    // Mutating the clone must not reach back into the bundled registry.
    expect(arenaById("raw")!.stage).toBe(original.stage);
    expect(arenaById("raw")!.floor).toBe(original.floor);
    expect(arenaById("raw")!.arenaTextures).not.toHaveProperty("mat_new");
  });
});

describe("previewing a draft", () => {
  it("renders the same shape that would be saved", () => {
    const draft = base();
    expect(draftToArenaData(draft)).toEqual(draftToJson(draft));
  });

  it("stands in an id so a half-named draft still renders", () => {
    expect(draftToArenaData(base({ id: "" })).id).toBe("draft");
  });
});
