/**
 * Builds a preview copy of the animation library: every clip with the aki-man
 * mesh skinned to its skeleton, so a viewer shows a wrestler instead of bare
 * bones.
 *
 * Run from the project root, after tools/organize-animation-library.mjs:
 *
 *     node tools/preview-animation-library.mjs [library] [out-dir] [mesh]
 *
 * Defaults: `assets/local/animations/library` -> `assets/local/animations/library-2`,
 * mesh `assets/local/animations/aki-man.glb` (a Blender export of the aki-man
 * armature and its mesh).
 *
 * The clip's own nodes, accessors, buffer views, animation and binary data are
 * kept byte for byte; the mesh, skin, materials and textures are appended
 * after them. Nothing goes through Blender, so the clips keep their units
 * (a Blender round trip of an AKI clip comes back at 0.01).
 *
 * The bind matrices are rebuilt from the clip skeleton, not taken from the
 * mesh export: Blender writes its joints with rest rotations the clips do not
 * have. Positions are put back into raw rig units so each inverse bind matrix
 * is a plain T(-p) and the mesh node sits under the skeleton root. That is
 * exact under the glTF spec (world = S * T(p) * T(-p) * v = S * v) and is the
 * layout Blender's importer reads correctly: it takes bind matrices relative
 * to the armature, so a root scale inside them would shift its rest pose.
 *
 * The preview copies are for looking at. The game reads clips by bone name
 * and must not take a mesh from them.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readGlb, writeGlb } from "./prepare-character-glb.mjs";

/** Every .glb under `dir`, as paths relative to it. */
function listGlbs(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listGlbs(full, base);
    return entry.name.endsWith(".glb") ? [path.relative(base, full)] : [];
  });
}

/** Rest position of each node relative to the skeleton root, in raw rig units. */
function restPositions(nodes) {
  const positions = new Map();
  const walk = (index, at) => {
    positions.set(index, at);
    for (const child of nodes[index].children ?? []) {
      const node = nodes[child];
      if (node.rotation || node.scale) throw new Error(`${node.name} has a rest rotation or scale`);
      const t = node.translation ?? [0, 0, 0];
      walk(child, [at[0] + t[0], at[1] + t[1], at[2] + t[2]]);
    }
  };
  walk(0, [0, 0, 0]);
  return positions;
}

/** Byte offset of an accessor's data in the BIN chunk. */
function accessorOffset(json, accessor) {
  return (json.bufferViews[accessor.bufferView].byteOffset ?? 0) + (accessor.byteOffset ?? 0);
}

/**
 * Loads the mesh export and fits it to the clip skeleton: positions to raw
 * units, inverse bind matrices to T(-p). Returns the export plus the joint
 * names in skin order, which its JOINTS_0 data indexes.
 */
function prepareMesh(meshFile, skeleton) {
  const { json, bin: source } = readGlb(meshFile);
  const bin = Buffer.from(source);
  const skin = json.skins?.[0];
  if (!skin || json.meshes?.length !== 1) throw new Error(`${meshFile} needs one skinned mesh`);
  const jointNames = skin.joints.map((index) => json.nodes[index].name);

  const [scale] = skeleton[0].scale;
  if (!skeleton[0].scale.every((s) => s === scale)) throw new Error("skeleton root scale is not uniform");

  const done = new Set();
  for (const primitive of json.meshes[0].primitives) {
    const index = primitive.attributes.POSITION;
    if (done.has(index)) continue;
    done.add(index);
    const accessor = json.accessors[index];
    const stride = json.bufferViews[accessor.bufferView].byteStride ?? 12;
    const offset = accessorOffset(json, accessor);
    for (let i = 0; i < accessor.count; i++) {
      for (let c = 0; c < 3; c++) {
        const at = offset + i * stride + c * 4;
        bin.writeFloatLE(Math.round((bin.readFloatLE(at) / scale) * 1e4) / 1e4, at);
      }
    }
    accessor.min = accessor.min.map((v) => Math.round((v / scale) * 1e4) / 1e4);
    accessor.max = accessor.max.map((v) => Math.round((v / scale) * 1e4) / 1e4);
  }

  const nodeByName = new Map(skeleton.map((node, index) => [node.name, index]));
  const rest = restPositions(skeleton);
  const ibmOffset = accessorOffset(json, json.accessors[skin.inverseBindMatrices]);
  jointNames.forEach((name, k) => {
    if (!nodeByName.has(name)) throw new Error(`clip skeleton has no joint ${name}`);
    const [x, y, z] = rest.get(nodeByName.get(name));
    // Column-major.
    const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -x, -y, -z, 1];
    matrix.forEach((v, i) => bin.writeFloatLE(v, ibmOffset + k * 64 + i * 4));
  });

  return { json, bin, jointNames };
}

/** The clip with the mesh appended: new entries go after the clip's own, which keep their indices. */
function addMesh(clip, mesh) {
  const json = structuredClone(clip.json);
  const m = mesh.json;

  const base = Math.ceil(clip.bin.length / 16) * 16;
  const bin = Buffer.concat([clip.bin, Buffer.alloc(base - clip.bin.length), mesh.bin]);
  json.buffers[0].byteLength = bin.length;

  const bufferViews = json.bufferViews.length;
  const accessors = json.accessors.length;
  for (const view of m.bufferViews) {
    json.bufferViews.push({ ...view, buffer: 0, byteOffset: (view.byteOffset ?? 0) + base });
  }
  for (const accessor of m.accessors) json.accessors.push({ ...accessor, bufferView: accessor.bufferView + bufferViews });

  json.samplers ??= [];
  json.images ??= [];
  json.textures ??= [];
  json.materials ??= [];
  const samplers = json.samplers.length;
  const images = json.images.length;
  const textures = json.textures.length;
  const materials = json.materials.length;

  for (const sampler of m.samplers ?? []) json.samplers.push({ ...sampler });
  for (const image of m.images ?? []) json.images.push({ ...image, bufferView: image.bufferView + bufferViews });
  for (const texture of m.textures ?? []) {
    json.textures.push({
      ...texture,
      source: texture.source + images,
      ...(texture.sampler !== undefined && { sampler: texture.sampler + samplers }),
    });
  }
  const shiftTextures = (value) => {
    if (Array.isArray(value)) return value.forEach(shiftTextures);
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key.endsWith("Texture") && typeof child?.index === "number") child.index += textures;
      shiftTextures(child);
    }
  };
  for (const material of m.materials ?? []) {
    const copy = structuredClone(material);
    shiftTextures(copy);
    json.materials.push(copy);
  }

  const meshData = structuredClone(m.meshes[0]);
  for (const primitive of meshData.primitives) {
    for (const key of Object.keys(primitive.attributes)) primitive.attributes[key] += accessors;
    primitive.indices += accessors;
    if (primitive.material !== undefined) primitive.material += materials;
  }
  json.meshes ??= [];
  json.meshes.push(meshData);

  const nodeByName = new Map(json.nodes.map((node, index) => [node.name, index]));
  json.skins ??= [];
  json.skins.push({
    name: "aki-man",
    inverseBindMatrices: m.skins[0].inverseBindMatrices + accessors,
    joints: mesh.jointNames.map((name) => nodeByName.get(name)),
    skeleton: 0,
  });
  json.nodes.push({ name: "aki-man_mesh", mesh: json.meshes.length - 1, skin: json.skins.length - 1 });
  (json.nodes[0].children ??= []).push(json.nodes.length - 1);

  return { json, bin };
}

export function previewLibrary(libraryDir, outDir, meshFile) {
  const files = listGlbs(libraryDir).sort();
  let mesh = null;
  let skeleton = null;

  for (const file of files) {
    const clip = readGlb(path.join(libraryDir, file));
    if (!mesh) {
      skeleton = JSON.stringify(clip.json.nodes);
      mesh = prepareMesh(meshFile, clip.json.nodes);
    }
    // One bind for every file, so every file must share the skeleton it was made from.
    if (JSON.stringify(clip.json.nodes) !== skeleton) throw new Error(`${file}: skeleton differs from the rest`);

    const { json, bin } = addMesh(clip, mesh);
    const target = path.join(outDir, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    writeGlb(target, json, bin);
  }

  // The catalog and source manifests, so the copy is browsable on its own.
  for (const name of ["catalog.json", "sources"]) {
    const from = path.join(libraryDir, name);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(outDir, name), { recursive: true });
  }
  return files.length;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const libraryDir = process.argv[2] ?? "assets/local/animations/library";
  const outDir = process.argv[3] ?? "assets/local/animations/library-2";
  const meshFile = process.argv[4] ?? "assets/local/animations/aki-man.glb";
  if (path.resolve(libraryDir) === path.resolve(outDir)) {
    console.error("out-dir must differ from the library; the originals are never overwritten");
    process.exit(1);
  }

  const count = previewLibrary(libraryDir, outDir, meshFile);
  console.log(`${count} clips written to ${outDir} with ${path.basename(meshFile)}`);
}
