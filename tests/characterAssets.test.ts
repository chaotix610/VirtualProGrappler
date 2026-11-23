import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REQUIRED_CLIPS } from "@/game/config";

/**
 * Guards the shape of the prepared character GLBs.
 *
 * `tools/prepare-character-glb.mjs` clears the export flags and atlases the
 * per-part textures, but a Blender re-export dropped straight into
 * assets/characters/models would quietly undo all of it - that file is generated,
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
  accessors?: { bufferView?: number; byteOffset?: number; count: number }[];
  bufferViews?: { byteOffset?: number; byteStride?: number }[];
  images?: unknown[];
  meshes?: { name?: string; primitives?: { material?: number }[] }[];
  skins?: { joints?: number[] }[];
  animations?: {
    name?: string;
    channels: { sampler: number; target: { node?: number; path: string } }[];
    samplers: { output: number }[];
  }[];
}

function readGlb(path: string): { json: GlbJson; bin: Buffer } {
  const data = readFileSync(path);
  let offset = GLB_HEADER_BYTES;
  let json: GlbJson | null = null;
  let bin = Buffer.alloc(0);

  while (offset < data.length) {
    const chunkLength = data.readUInt32LE(offset);
    const chunkType = data.toString(
      "ascii",
      offset + 4,
      offset + GLB_CHUNK_HEADER_BYTES
    );
    offset += GLB_CHUNK_HEADER_BYTES;

    const chunk = data.subarray(offset, offset + chunkLength);
    if (chunkType === "JSON") json = JSON.parse(chunk.toString("utf8"));
    else if (chunkType.startsWith("BIN")) bin = chunk;

    offset += chunkLength;
  }

  if (!json) throw new Error(`${path} has no JSON chunk`);
  return { json, bin };
}

/** One VEC3 of a float accessor; negative `element` counts from the end. */
function vec3At(glb: GlbJson, bin: Buffer, index: number, element: number): number[] {
  const accessor = glb.accessors![index];
  const view = glb.bufferViews![accessor.bufferView!];
  const stride = view.byteStride ?? 12;
  const k = element < 0 ? accessor.count + element : element;
  const at = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + k * stride;
  return [0, 1, 2].map((c) => bin.readFloatLE(at + c * 4));
}

/** The AKI rig: what every clip is authored against. */
const AKI_JOINTS = [
  "Pelvis", "LowerAbdomen", "UpperBody", "Neck", "Head",
  "LeftUpperArm", "LeftForearm", "LeftHand", "LeftFingers",
  "RightUpperArm", "RightForearm", "RightHand", "RightFingers",
  "LeftUpperLeg", "LeftLowerLeg", "LeftFoot",
  "RightUpperLeg", "RightLowerLeg", "RightFoot",
];

describe("prepared character GLBs", () => {
  const path = "assets/characters/models/steve_austin.glb";
  const { json: glb, bin } = readGlb(path);

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
    // contract shared with the animation clips, and AKI joints are PascalCase.
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

  it("is skinned to the 19-joint AKI rig", () => {
    // Every clip is authored against these joints. A character on any other
    // skeleton cannot share them.
    const joints = (glb.skins?.[0]?.joints ?? []).map((i) => glb.nodes?.[i]?.name);
    expect([...joints].sort()).toEqual([...AKI_JOINTS].sort());
  });

  it("faces +Z, the way the game turns him", () => {
    // Yaw 0 faces +Z. The AKI clips face -Z as exported and the pipeline turns
    // the root round; the punch steps forward, so its root motion shows which
    // way forward ended up.
    const motionNode = (glb.nodes ?? []).findIndex((n) => n.name === "root_motion");
    const punch = (glb.animations ?? []).find((a) => a.name === "austin_punch");
    const channel = punch?.channels.find((c) => c.target.node === motionNode);
    expect(channel).toBeDefined();

    const [, , z] = vec3At(glb, bin, punch!.samplers[channel!.sampler].output, -1);
    expect(z).toBeGreaterThan(0.2);
  });

  it("keeps every clip's travel off the body", () => {
    // Root motion is split out in the pipeline, so the pelvis ends every clip
    // where it started on X/Z - the root carries the travel instead, through
    // the root_motion track.
    const pelvis = (glb.nodes ?? []).findIndex((n) => n.name === "Pelvis");
    const drifting = (glb.animations ?? [])
      .filter((a) => {
        const channel = a.channels.find(
          (c) => c.target.node === pelvis && c.target.path === "translation"
        );
        if (!channel) return false;
        const keys = a.samplers[channel.sampler].output;
        const [x0, , z0] = vec3At(glb, bin, keys, 0);
        const [x1, , z1] = vec3At(glb, bin, keys, -1);
        return Math.abs(x1 - x0) > 1e-4 || Math.abs(z1 - z0) > 1e-4;
      })
      .map((a) => a.name);

    expect(drifting).toEqual([]);
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
