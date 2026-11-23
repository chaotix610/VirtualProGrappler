import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lightCardKind } from "@/renderer/lightCards";

/** Node names in a GLB's JSON chunk. */
function nodeNames(path: string): string[] {
  const data = readFileSync(path);
  let offset = 12;
  while (offset < data.length) {
    const length = data.readUInt32LE(offset);
    const type = data.toString("ascii", offset + 4, offset + 8);
    offset += 8;
    if (type === "JSON") {
      const json = JSON.parse(data.subarray(offset, offset + length).toString("utf8"));
      return (json.nodes ?? []).map((node: { name?: string }) => node.name ?? "");
    }
    offset += length;
  }
  return [];
}

describe("light cards", () => {
  it("reads what a card does from its name", () => {
    expect(lightCardKind("flare_crown_1")).toEqual({ billboard: true, twinkle: true, bloom: true });
    expect(lightCardKind("glow_lamp_03")).toEqual({ billboard: true, twinkle: false, bloom: true });
    expect(lightCardKind("haze_2")).toEqual({ billboard: false, twinkle: false, bloom: false });
    expect(lightCardKind("beam_7")).toEqual({ billboard: false, twinkle: false, bloom: false });
  });

  it("leaves solid meshes alone, even ones that mention light", () => {
    for (const name of ["entrance_truss", "ring_post_ne", "mat_ceiling_lights", "spotlight_flare"]) {
      expect(lightCardKind(name), name).toBeNull();
    }
  });

  it("finds the lamp glows and beams in the lit ceiling", () => {
    const names = nodeNames("assets/environments/arenas/shared/models/ceiling_trusses_lit.glb");
    expect(names.filter((n) => lightCardKind(n)?.bloom).length).toBe(44);
    expect(names.filter((n) => n.startsWith("beam_")).length).toBe(8);
  });

  it("finds the flares and haze on the Monday Nitro stage", () => {
    const names = nodeNames("assets/environments/arenas/shared/models/stage/monday_nitro.glb");
    expect(names.filter((n) => lightCardKind(n)?.twinkle).length).toBe(6);
    expect(names.filter((n) => n.startsWith("haze_")).length).toBe(4);
  });
});
