import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REQUIRED_CLIPS } from "@/game/config";

/**
 * Guards the shape of the prepared character GLBs.
 *
 * `tools/prepare-character-glb.mjs` clears the export flags and atlases the
 * per-part textures, but a Blender re-export dropped straight into
 * assets/runtime would quietly undo all of it - the runtime tree is generated,
 * and nothing else notices when a generated file is overwritten by hand. These
 * assertions are what notices.
 */

const GLB_HEADER_BYTES = 12;
const GLB_CHUNK_HEADER_BYTES = 8;

interface GlbJson {
  materials?: {
    name?: string;
    alphaMode?: string;
    doubleSided?: boolean;
    extensions?: Record<string, unknown>;
  }[];
  nodes?: { name?: string }[];
  images?: unknown[];
  meshes?: { name?: string; primitives?: { material?: number }[] }[];
  skins?: { joints?: number[] }[];
  animations?: { name?: string }[];
}

function readGlbJson(path: string): GlbJson {
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

    if (chunkType === "JSON") {
      return JSON.parse(data.subarray(offset, offset + chunkLength).toString("utf8"));
    }

    offset += chunkLength;
  }

  throw new Error(`${path} has no JSON chunk`);
}

describe("prepared character GLBs", () => {
  const path = "assets/runtime/models/steve_austin.glb";
  const glb = readGlbJson(path);

  it("ships a single atlased material", () => {
    // One material is what later lets the rigged parts merge into one skinned
    // mesh, and one draw call, instead of twenty-one.
    expect(glb.materials).toHaveLength(1);
    expect(glb.images).toHaveLength(1);
  });

  it("does not alpha-test or double-side any material", () => {
    // Every source texture is fully opaque, so MASK was costing fill rate for
    // nothing, and the model is closed, so back-face culling is safe.
    const flagged = (glb.materials ?? [])
      .filter((m) => (m.alphaMode && m.alphaMode !== "OPAQUE") || m.doubleSided)
      .map((m) => m.name);

    expect(flagged).toEqual([]);
  });

  it("names every part node in lower case", () => {
    // A single capitalised part is enough to make a bone-mapping table keyed
    // on part names miss it silently. Joints are exempt: bone names are a
    // contract shared with the animation library, where `Head` is capitalised.
    const joints = new Set((glb.skins ?? []).flatMap((s) => s.joints ?? []));
    const mixedCase = (glb.nodes ?? [])
      .map((n, i) => ({ name: n.name, joint: joints.has(i) }))
      .filter((n) => n.name && !n.joint)
      .map((n) => n.name as string)
      .filter((name) => name !== name.toLowerCase());

    expect(mixedCase).toEqual([]);
  });

  it("is skinned, and carries every clip the game requires", () => {
    // Without this the character loads and slides around the ring frozen in
    // its bind pose, which the game only reports as a HUD warning.
    expect(glb.skins ?? []).toHaveLength(1);

    const clips = new Set((glb.animations ?? []).map((a) => a.name));
    const absent = REQUIRED_CLIPS.filter((c) => !clips.has(c));

    expect(absent).toEqual([]);
  });

  it("declares itself unlit", () => {
    // The shading is painted into the texture; lighting it again doubles it.
    expect(glb.materials?.[0]?.extensions).toHaveProperty("KHR_materials_unlit");
  });

  it("points every primitive at that one material", () => {
    const strays = (glb.meshes ?? [])
      .filter((mesh) =>
        (mesh.primitives ?? []).some((p) => p.material !== undefined && p.material !== 0)
      )
      .map((mesh) => mesh.name);

    expect(strays).toEqual([]);
  });
});
