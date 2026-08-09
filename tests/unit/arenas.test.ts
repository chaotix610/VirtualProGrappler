import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { arenaById, arenaParts, availableArenas } from "@/data/arenas";
import { cssColorToRgb } from "@/renderer/cssColor";
import { resolveAsset } from "@/data/assets";

const GLB_HEADER_BYTES = 12;
const GLB_CHUNK_HEADER_BYTES = 8;
const GLB_JSON_CHUNK = "JSON";

function materialNamesInGlb(path: string): string[] {
  const data = readFileSync(path);
  let offset = GLB_HEADER_BYTES;

  while (offset < data.length) {
    const chunkLength = data.readUInt32LE(offset);
    const chunkType = data.toString(
      "ascii",
      offset + 4,
      offset + GLB_CHUNK_HEADER_BYTES
    );
    offset += GLB_CHUNK_HEADER_BYTES;

    if (chunkType === GLB_JSON_CHUNK) {
      const json = JSON.parse(data.subarray(offset, offset + chunkLength).toString("utf8"));
      return (json.materials ?? [])
        .map((material: { name?: string }) => material.name)
        .filter((name: string | undefined): name is string => Boolean(name));
    }

    offset += chunkLength;
  }

  return [];
}

describe("arena catalog", () => {
  const arenas = availableArenas();

  it("loads every arena file", () => {
    expect(arenas).toHaveLength(10);
  });

  it("sorts by display name", () => {
    const names = arenas.map((a) => a.displayName);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("gives every arena a preview the viewer can show", () => {
    const withoutPreview = arenas.filter((a) => a.previewUrl === null);
    expect(withoutPreview.map((a) => a.id)).toEqual([]);
  });

  it("keys arenas by filename, so a stray id field cannot hide one", () => {
    for (const summary of arenas) {
      expect(arenaById(summary.id), summary.id).not.toBeNull();
    }
  });

  it("returns null for an unknown arena rather than throwing", () => {
    expect(arenaById("no-such-arena")).toBeNull();
  });
});

describe("arena parts", () => {
  it("normalises bare string parts", () => {
    const parts = arenaParts({
      id: "x",
      displayName: "X",
      arenaParts: ["assets/glb/arena/arena-floor.glb"],
    });
    expect(parts).toEqual([
      {
        glb: "assets/glb/arena/arena-floor.glb",
        position: [0, 0, 0],
        rotation: [0, 0, 0],
      },
    ]);
  });

  it("keeps a placement when one is given", () => {
    const parts = arenaParts({
      id: "x",
      displayName: "X",
      arenaParts: [
        { glb: "assets/glb/arena/barricade.glb", position: [1, 2, 3], rotation: [0, 1, 0] },
      ],
    });
    expect(parts[0].position).toEqual([1, 2, 3]);
    expect(parts[0].rotation).toEqual([0, 1, 0]);
  });

  it("accepts the legacy single-GLB field", () => {
    const parts = arenaParts({
      id: "x",
      displayName: "X",
      arenaGlb: "assets/glb/arena/arena-floor.glb",
    });
    expect(parts).toHaveLength(1);
    expect(parts[0].glb).toBe("assets/glb/arena/arena-floor.glb");
  });

  it("drops malformed entries instead of loading undefined", () => {
    const parts = arenaParts({
      id: "x",
      displayName: "X",
      // Shapes the schema would reject, guarded anyway since this runs first.
      arenaParts: ["", { glb: "" }, null as never],
    });
    expect(parts).toEqual([]);
  });

  it("reports no parts when the arena lists none", () => {
    expect(arenaParts({ id: "x", displayName: "X" })).toEqual([]);
  });
});

describe("every arena's referenced assets resolve", () => {
  it("resolves each part GLB and override texture", () => {
    const unresolved: string[] = [];

    for (const summary of availableArenas()) {
      const arena = arenaById(summary.id)!;

      for (const part of arenaParts(arena)) {
        if (!resolveAsset(part.glb)) unresolved.push(`${summary.id}: ${part.glb}`);
      }

      for (const overrides of [arena.ringOverrides, arena.arenaOverrides]) {
        for (const [key, value] of Object.entries(overrides ?? {})) {
          // `*Color` keys hold CSS colours, not asset paths.
          if (key.endsWith("Color")) continue;
          if (!resolveAsset(value)) unresolved.push(`${summary.id}.${key}: ${value}`);
        }
      }
    }

    expect(unresolved).toEqual([]);
  });

  it("parses every colour override the arenas use", () => {
    const unparseable: string[] = [];

    for (const summary of availableArenas()) {
      const arena = arenaById(summary.id)!;
      for (const overrides of [arena.ringOverrides, arena.arenaOverrides]) {
        for (const [key, value] of Object.entries(overrides ?? {})) {
          if (!key.endsWith("Color")) continue;
          if (!cssColorToRgb(value)) unparseable.push(`${summary.id}.${key}: ${value}`);
        }
      }
    }

    expect(unparseable).toEqual([]);
  });

  it("targets materials that exist in each arena's GLB parts", () => {
    const unknown: string[] = [];
    const materialCache = new Map<string, string[]>();

    for (const summary of availableArenas()) {
      const arena = arenaById(summary.id)!;
      const materialNames = new Set<string>();

      for (const part of arenaParts(arena)) {
        const cached =
          materialCache.get(part.glb) ??
          materialNamesInGlb(part.glb);
        materialCache.set(part.glb, cached);
        for (const name of cached) materialNames.add(name);
      }

      for (const key of Object.keys(arena.arenaOverrides ?? {})) {
        if (key.endsWith("Color")) continue;
        if (!materialNames.has(key)) unknown.push(`${summary.id}: ${key}`);
      }
    }

    expect(unknown).toEqual([]);
  });
});

describe("css colours", () => {
  it("parses six-digit hex", () => {
    expect(cssColorToRgb("#FF0000")).toEqual({ r: 1, g: 0, b: 0 });
    expect(cssColorToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("expands shorthand hex", () => {
    expect(cssColorToRgb("#f00")).toEqual(cssColorToRgb("#ff0000"));
  });

  it("parses rgb and rgba, discarding alpha", () => {
    expect(cssColorToRgb("rgb(255, 0, 0)")).toEqual({ r: 1, g: 0, b: 0 });
    expect(cssColorToRgb("rgba(0, 0, 255, 0.4)")).toEqual({ r: 0, g: 0, b: 1 });
  });

  it("tolerates surrounding whitespace", () => {
    expect(cssColorToRgb("  #ff0000  ")).toEqual({ r: 1, g: 0, b: 0 });
  });

  it("refuses out-of-range channels rather than clamping a typo", () => {
    expect(cssColorToRgb("rgb(300, 0, 0)")).toBeNull();
  });

  it("returns null for anything it cannot read", () => {
    expect(cssColorToRgb("red")).toBeNull();
    expect(cssColorToRgb("#12345")).toBeNull();
    expect(cssColorToRgb("")).toBeNull();
  });
});
