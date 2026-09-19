import { describe, expect, it } from "vitest";
import { ArenaData, arenaById } from "@/data/arenas";
import {
  ArenaDraft,
  cloneArena,
  draftFromArena,
  draftToArenaData,
  draftToJson,
  existingIds,
  idProblem,
  isColorKey,
} from "@/data/arenaDraft";

const base = (over: Partial<ArenaDraft> = {}): ArenaDraft => ({
  id: "test_arena",
  displayName: "Test Arena",
  previewImage: "",
  parts: [],
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
    expect(out.arenaParts).toEqual(raw.arenaParts);
    expect(out.arenaTextures).toEqual(raw.arenaTextures);
    expect(out.ringTextures).toEqual(raw.ringTextures);
  });

  it("round-trips every bundled arena", () => {
    for (const id of existingIds()) {
      const arena = arenaById(id)!;
      const out = draftToJson(draftFromArena(arena));
      expect(
        { id, parts: out.arenaParts },
        `${id} changed shape through the editor`
      ).toEqual({ id, parts: arena.arenaParts });
    }
  });
});

describe("serialising a draft", () => {
  it("writes an unplaced part as a bare path", () => {
    const out = draftToJson(
      base({ parts: [{ glb: "a.glb", position: [0, 0, 0], rotation: [0, 0, 0] }] })
    );
    expect(out.arenaParts).toEqual(["a.glb"]);
  });

  it("writes only the placement that was set", () => {
    const out = draftToJson(
      base({
        parts: [
          { glb: "a.glb", position: [1, 0, 0], rotation: [0, 0, 0] },
          { glb: "b.glb", position: [0, 0, 0], rotation: [0, 1.5, 0] },
        ],
      })
    );
    expect(out.arenaParts).toEqual([
      { glb: "a.glb", position: [1, 0, 0] },
      { glb: "b.glb", rotation: [0, 1.5, 0] },
    ]);
  });

  it("drops parts with no GLB rather than writing an empty path", () => {
    const out = draftToJson(
      base({
        parts: [
          { glb: "", position: [0, 0, 0], rotation: [0, 0, 0] },
          { glb: "a.glb", position: [0, 0, 0], rotation: [0, 0, 0] },
        ],
      })
    );
    expect(out.arenaParts).toEqual(["a.glb"]);
  });

  it("omits empty optional fields instead of writing blanks", () => {
    const out = draftToJson(base());
    expect(out).not.toHaveProperty("previewImage");
    expect(out).not.toHaveProperty("arenaTextures");
    expect(out).not.toHaveProperty("ringTextures");
  });

  it("drops blank texture values, which would resolve to nothing", () => {
    const out = draftToJson(
      base({ arenaTextures: { mat_floor: "floor.png", mat_wall: "  " } })
    );
    expect(out.arenaTextures).toEqual({ mat_floor: "floor.png" });
  });
});

describe("cloning", () => {
  const source = (): ArenaData => arenaById("raw")!;

  it("copies the parts and textures of its source", () => {
    const clone = cloneArena(source(), "new_arena", "New Arena");
    expect(clone.parts).toEqual(draftFromArena(source()).parts);
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
    clone.parts.push({ glb: "extra.glb", position: [0, 0, 0], rotation: [0, 0, 0] });
    clone.arenaTextures.mat_new = "x.png";

    // Mutating the clone must not reach back into the bundled registry.
    expect(arenaById("raw")!.arenaParts).toEqual(original.arenaParts);
    expect(arenaById("raw")!.arenaTextures).not.toHaveProperty("mat_new");
  });
});

describe("previewing a draft", () => {
  it("renders the same shape that would be saved", () => {
    const draft = base({
      parts: [{ glb: "a.glb", position: [0, 0, 0], rotation: [0, 0, 0] }],
    });
    expect(draftToArenaData(draft)).toEqual(draftToJson(draft));
  });

  it("stands in an id so a half-named draft still renders", () => {
    expect(draftToArenaData(base({ id: "" })).id).toBe("draft");
  });
});
