import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { availableRings, defaultRing, resolveRing, ringByGlb } from "@/data/rings";
import { arenaById, availableArenas } from "@/data/arenas";
import { resolveAsset } from "@/data/assets";
import { RING } from "@/game/config";

const STANDARD = "assets/environments/arenas/shared/ring/models/ring-standard.glb";
const STANDARD_2 = "assets/environments/arenas/shared/ring/models/ring-standard-2.glb";

/** Node names in a GLB's JSON chunk - the mesh names gameplay looks rings up by. */
function nodeNamesInGlb(path: string): string[] {
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

describe("the ring registry", () => {
  it("lists the original ring first, so arenas that name none keep it", () => {
    expect(defaultRing().glb).toBe(STANDARD);
  });

  it("offers ring-standard-2", () => {
    expect(ringByGlb(STANDARD_2)?.id).toBe("standard_2");
  });

  it("bundles every ring it offers", () => {
    const missing = availableRings()
      .filter((ring) => !resolveAsset(ring.glb))
      .map((ring) => ring.glb);
    expect(missing).toEqual([]);
  });

  it("gives every ring the mat and ropes gameplay finds by name", () => {
    for (const ring of availableRings()) {
      const names = nodeNamesInGlb(ring.glb);
      expect(names.some((n) => n.includes(RING.canvasMesh)), ring.id).toBe(true);
      expect(names.filter((n) => n.startsWith(RING.ropePrefix)).length, ring.id).toBe(12);
    }
  });

  it("places two sets of steps against every ring", () => {
    for (const ring of availableRings()) {
      expect(ring.steps.map((s) => s.corner).sort(), ring.id).toEqual(["ne", "sw"]);
    }
  });

  it("lets a ring that embeds its art fall back to it, with no renderer defaults", () => {
    expect(ringByGlb(STANDARD_2)?.defaultTextures).toBeUndefined();
    expect(Object.keys(ringByGlb(STANDARD)?.defaultTextures ?? {})).toContain(
      "mat_turnbuckle_bolt_cover"
    );
  });

  it("bundles the default art a ring names", () => {
    const missing = availableRings().flatMap((ring) =>
      Object.values(ring.defaultTextures ?? {}).filter((path) => !resolveAsset(path))
    );
    expect(missing).toEqual([]);
  });

  it("falls back to the default ring for a blank or unknown value", () => {
    expect(resolveRing(undefined).glb).toBe(STANDARD);
    expect(resolveRing("").glb).toBe(STANDARD);
    expect(resolveRing("assets/no/such/ring.glb").glb).toBe(STANDARD);
    expect(resolveRing(STANDARD_2).glb).toBe(STANDARD_2);
  });

  it("names only known rings in the arena files", () => {
    const unknown = availableArenas()
      .map((summary) => arenaById(summary.id)!)
      .filter((arena) => arena.ring && !ringByGlb(arena.ring))
      .map((arena) => `${arena.id}: ${arena.ring}`);
    expect(unknown).toEqual([]);
  });
});
