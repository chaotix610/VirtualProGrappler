/**
 * Post-processes a modular character GLB into something the game can use.
 *
 * Run from the project root:
 *
 *     node tools/prepare-character-glb.mjs <in.glb> <out.glb>
 *
 * Why this exists
 * ---------------
 * The Austin model is authored as one box mesh per body part, each with its
 * own material and texture. That is a fine way to *author* a blocky, N64-era
 * character, but three things about the export are wrong for the runtime, and
 * re-exporting from Blender reintroduces all of them - so the fix has to be a
 * repeatable step rather than a hand edit.
 *
 *  1. Every material comes out `alphaMode: MASK` and `doubleSided: true`.
 *     Alpha-testing every surface costs fill rate and complicates the shadow
 *     pass, and back-face culling is safe on a closed model. Neither flag is
 *     doing anything except slowing the model down.
 *
 *  2. One node is named `Leg_upper_right` where every other part is lower
 *     case. Any bone-mapping table keyed on part names silently misses it.
 *
 *  3. Thirteen materials means thirteen texture binds, and - more to the
 *     point - the parts cannot be merged into one mesh while they disagree
 *     about their material. Collapsing them to a single atlased material is
 *     what later lets the rigged parts become one skinned mesh, and one draw
 *     call, instead of twenty-one.
 *
 * The atlas is the only step that touches geometry: UVs are remapped into
 * their cell. The source UVs sit in [0,1] apart from sub-texel rounding
 * (max overshoot measured at 0.008, under one texel), so they are clamped
 * before remapping rather than tiled - at NEAREST filtering the clamp moves
 * at most one texel and is not visible.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const ATLAS_SIZE = 2048;
/** Gutter around each cell, so mip levels cannot bleed between neighbours. */
const PADDING = 2;

const COMPONENT_BYTES = {
  5120: 1, // BYTE
  5121: 1, // UNSIGNED_BYTE
  5122: 2, // SHORT
  5123: 2, // UNSIGNED_SHORT
  5125: 4, // UNSIGNED_INT
  5126: 4, // FLOAT
};

const TYPE_COMPONENTS = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
};

// --- GLB container ---------------------------------------------------------

function readGlb(file) {
  const data = fs.readFileSync(file);
  if (data.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file} is not a GLB`);

  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < data.length) {
    const length = data.readUInt32LE(offset);
    const type = data.toString("ascii", offset + 4, offset + 8);
    offset += 8;
    const chunk = data.subarray(offset, offset + length);
    if (type === "JSON") json = JSON.parse(chunk.toString("utf8"));
    else if (type.startsWith("BIN")) bin = chunk;
    offset += length;
  }
  if (!json) throw new Error("no JSON chunk");
  return { json, bin: bin ?? Buffer.alloc(0) };
}

/** Pads to a 4-byte boundary with `fill`, as the GLB spec requires. */
function pad(buffer, fill) {
  const remainder = buffer.length % 4;
  if (remainder === 0) return buffer;
  return Buffer.concat([buffer, Buffer.alloc(4 - remainder, fill)]);
}

function writeGlb(file, json, bin) {
  // JSON pads with spaces, BIN with zeroes.
  const jsonChunk = pad(Buffer.from(JSON.stringify(json), "utf8"), 0x20);
  const binChunk = pad(bin, 0x00);

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // "glTF"
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.write("JSON", 4, "ascii");

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binChunk.length, 0);
  binHeader.write("BIN\0", 4, "ascii");

  fs.writeFileSync(
    file,
    Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk])
  );
}

// --- accessor access -------------------------------------------------------

/**
 * Pulls one accessor out as a tightly packed buffer.
 *
 * Source data may be interleaved (`byteStride`), so this walks element by
 * element rather than slicing - the rebuilt file writes every accessor
 * de-interleaved, which is valid and keeps the rewrite simple.
 */
function readAccessor(json, bin, index) {
  const accessor = json.accessors[index];
  const components = TYPE_COMPONENTS[accessor.type];
  const componentBytes = COMPONENT_BYTES[accessor.componentType];
  const elementBytes = components * componentBytes;
  const out = Buffer.alloc(accessor.count * elementBytes);

  if (accessor.bufferView === undefined) return out; // sparse/zero-filled

  const view = json.bufferViews[accessor.bufferView];
  const stride = view.byteStride || elementBytes;
  const base = (view.byteOffset || 0) + (accessor.byteOffset || 0);

  for (let i = 0; i < accessor.count; i++) {
    bin.copy(out, i * elementBytes, base + i * stride, base + i * stride + elementBytes);
  }
  return out;
}

function readBufferView(json, bin, index) {
  const view = json.bufferViews[index];
  const start = view.byteOffset || 0;
  return bin.subarray(start, start + view.byteLength);
}

/**
 * Cuts a PNG off after its IEND chunk.
 *
 * Image bufferViews are padded to a 4-byte boundary, so the slice usually
 * carries a few trailing bytes that a strict decoder rejects as content after
 * the end of the stream.
 */
function trimPng(buffer) {
  let offset = 8; // signature
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    offset += 12 + length; // length + type + data + crc
    if (type === "IEND") return buffer.subarray(0, offset);
  }
  return buffer;
}

// --- fixes -----------------------------------------------------------------

/** Fix 1: drop the alpha-test and double-sided flags off every material. */
function fixMaterialFlags(json) {
  let changed = 0;
  for (const material of json.materials ?? []) {
    let touched = false;
    if (material.alphaMode && material.alphaMode !== "OPAQUE") {
      delete material.alphaMode;
      delete material.alphaCutoff;
      touched = true;
    }
    if (material.doubleSided) {
      delete material.doubleSided;
      touched = true;
    }
    if (touched) changed++;
  }
  return changed;
}

/** Fix 2: normalise node names so a part-keyed lookup cannot miss one. */
function fixNodeNames(json) {
  const renamed = [];

  // Joints are excluded. Bone names are a contract shared with the animation
  // library and the retarget script - `Head` is capitalised on the Quaternius
  // rig and has to stay that way - whereas part names are ours to normalise.
  const joints = new Set((json.skins ?? []).flatMap((skin) => skin.joints ?? []));

  (json.nodes ?? []).forEach((node, index) => {
    if (!node.name || joints.has(index)) return;
    const lower = node.name.toLowerCase();
    if (lower !== node.name) {
      renamed.push(`${node.name} -> ${lower}`);
      node.name = lower;
    }
  });

  return renamed;
}

/**
 * Shelf packer. Tallest first, which keeps the wasted strip under each shelf
 * small without needing a real bin-packing algorithm for thirteen rectangles.
 */
function packCells(images) {
  const sorted = [...images].sort((a, b) => b.height - a.height);
  const cells = new Map();

  let shelfY = 0;
  let shelfHeight = 0;
  let cursorX = 0;

  for (const image of sorted) {
    const w = image.width + PADDING * 2;
    const h = image.height + PADDING * 2;

    if (cursorX + w > ATLAS_SIZE) {
      shelfY += shelfHeight;
      shelfHeight = 0;
      cursorX = 0;
    }
    if (shelfY + h > ATLAS_SIZE) {
      throw new Error(
        `textures do not fit in a ${ATLAS_SIZE}x${ATLAS_SIZE} atlas`
      );
    }

    cells.set(image.index, {
      x: cursorX + PADDING,
      y: shelfY + PADDING,
      width: image.width,
      height: image.height,
    });

    cursorX += w;
    shelfHeight = Math.max(shelfHeight, h);
  }

  return { cells, usedHeight: shelfY + shelfHeight };
}

/** Copies a decoded PNG into the atlas, then bleeds its edges into the gutter. */
function blit(atlas, image, cell) {
  const put = (dx, dy, sx, sy) => {
    const to = (dy * ATLAS_SIZE + dx) * 4;
    const from = (sy * image.width + sx) * 4;
    image.data.copy(atlas.data, to, from, from + 4);
  };

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) put(cell.x + x, cell.y + y, x, y);
  }

  // Edge bleed: mip levels sample outside the cell, and replicating the
  // border is what stops a neighbouring texture showing up at that distance.
  for (let p = 1; p <= PADDING; p++) {
    for (let x = 0; x < image.width; x++) {
      put(cell.x + x, cell.y - p, x, 0);
      put(cell.x + x, cell.y + image.height - 1 + p, x, image.height - 1);
    }
    for (let y = -PADDING; y < image.height + PADDING; y++) {
      const sy = Math.min(Math.max(y, 0), image.height - 1);
      put(cell.x - p, cell.y + y, 0, sy);
      put(cell.x + image.width - 1 + p, cell.y + y, image.width - 1, sy);
    }
  }
}

/**
 * Fix 3: one material, one texture. Every primitive's UVs are remapped into
 * its old texture's cell in the atlas.
 */
function atlasMaterials(json, bin, uvData, { unlit }) {
  const images = (json.images ?? []).map((image, index) => {
    const png = PNG.sync.read(trimPng(Buffer.from(readBufferView(json, bin, image.bufferView))));
    return { index, width: png.width, height: png.height, png };
  });
  if (!images.length) return null;

  const { cells, usedHeight } = packCells(images);

  const atlas = new PNG({ width: ATLAS_SIZE, height: ATLAS_SIZE });
  atlas.data.fill(0);
  for (const image of images) blit(atlas, image.png, cells.get(image.index));

  // Material index -> the image it sampled, so a primitive can find its cell.
  const imageOfMaterial = new Map();
  (json.materials ?? []).forEach((material, index) => {
    const texture = material.pbrMetallicRoughness?.baseColorTexture;
    if (!texture) return;
    imageOfMaterial.set(index, json.textures[texture.index].source);
  });

  // Rewrite each UV accessor into its cell. Accessors are per-primitive here,
  // but guard anyway: a shared accessor pulled into two different cells would
  // be silently wrong.
  const remapped = new Map();
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const uv = primitive.attributes?.TEXCOORD_0;
      if (uv === undefined || primitive.material === undefined) continue;

      const imageIndex = imageOfMaterial.get(primitive.material);
      if (imageIndex === undefined) continue;
      const cell = cells.get(imageIndex);

      const seen = remapped.get(uv);
      if (seen !== undefined) {
        if (seen !== imageIndex) {
          throw new Error(
            `UV accessor ${uv} is shared by primitives in different atlas cells`
          );
        }
        continue;
      }
      remapped.set(uv, imageIndex);

      const buffer = uvData.get(uv);
      for (let i = 0; i < buffer.length; i += 8) {
        const u = Math.min(Math.max(buffer.readFloatLE(i), 0), 1);
        const v = Math.min(Math.max(buffer.readFloatLE(i + 4), 0), 1);
        // glTF UV origin is top-left and PNG rows run top-down, so V needs no
        // flip - the cell's y is already measured from the top.
        buffer.writeFloatLE((cell.x + u * cell.width) / ATLAS_SIZE, i);
        buffer.writeFloatLE((cell.y + v * cell.height) / ATLAS_SIZE, i + 4);
      }
    }
  }

  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      if (primitive.material !== undefined) primitive.material = 0;
    }
  }

  const name = json.materials?.[0]?.name ?? "mat_character";
  const material = {
    name: name.replace(/^mat_.*/, "mat_character"),
    pbrMetallicRoughness: {
      baseColorTexture: { index: 0 },
      metallicFactor: 0,
      roughnessFactor: 1,
    },
  };

  if (unlit) {
    // The low-poly characters carry their shading in the texture - the muscle
    // definition, the creases, the shadow under the jaw are all painted in.
    // Lighting them again doubles it up and muddies the art, so the material
    // is marked unlit and the base colour is shown exactly as authored.
    //
    // KHR_materials_unlit is the glTF way to say that, which means it travels
    // with the asset rather than living in whichever scene loads it. Babylon
    // registers the extension by default and maps it to `PBRMaterial.unlit`.
    material.extensions = { KHR_materials_unlit: {} };
    json.extensionsUsed = [
      ...new Set([...(json.extensionsUsed ?? []), "KHR_materials_unlit"]),
    ];
  }

  json.materials = [material];
  json.textures = [{ sampler: 0, source: 0 }];
  // NEAREST magnification keeps the blocky texel look; mipmaps stay on so the
  // model does not shimmer at distance, which the gutter above makes safe.
  json.samplers = [{ magFilter: 9728, minFilter: 9987, wrapS: 33071, wrapT: 33071 }];

  return { atlas, usedHeight, count: images.length };
}

// --- rebuild ---------------------------------------------------------------

/**
 * Writes a fresh buffer holding only what is still referenced.
 *
 * The old image bufferViews are dropped on the floor here rather than left
 * orphaned - which is the point, since the thirteen source PNGs are 2.25MB of
 * the 2.35MB file.
 */
function rebuildBuffer(json, accessorData, atlasPng) {
  const parts = [];
  let offset = 0;
  const bufferViews = [];

  const append = (buffer, extra = {}) => {
    const padded = pad(buffer, 0x00);
    parts.push(padded);
    const view = { buffer: 0, byteOffset: offset, byteLength: buffer.length, ...extra };
    offset += padded.length;
    bufferViews.push(view);
    return bufferViews.length - 1;
  };

  // Only geometry carries a usage hint. Inverse bind matrices and animation
  // samplers must not: they are read on the CPU, never bound as GPU buffers,
  // and the spec disallows a target on them.
  const indexAccessors = new Set();
  const attributeAccessors = new Set();
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      if (primitive.indices !== undefined) indexAccessors.add(primitive.indices);
      for (const accessor of Object.values(primitive.attributes ?? {})) {
        attributeAccessors.add(accessor);
      }
    }
  }

  json.accessors.forEach((accessor, index) => {
    const data = accessorData.get(index);
    const extra = indexAccessors.has(index)
      ? { target: 34963 }
      : attributeAccessors.has(index)
        ? { target: 34962 }
        : {};
    accessor.bufferView = append(data, extra);
    delete accessor.byteOffset;
  });

  if (atlasPng) {
    const png = PNG.sync.write(atlasPng, { deflateLevel: 9 });
    json.images = [{ name: "atlas", mimeType: "image/png", bufferView: append(png) }];
  }

  json.bufferViews = bufferViews;
  const bin = Buffer.concat(parts);
  json.buffers = [{ byteLength: bin.length }];
  return bin;
}

// --- entry point -----------------------------------------------------------

/** Stamped into `asset.generator`, so a prepared file is recognisable. */
const MARKER = "vpg prepare-character-glb";

/**
 * Whether a GLB has already been through this tool.
 *
 * Modification time alone cannot tell a prepared file from a raw export hand
 * copied over the top of one - and the raw export is the newer file, so it
 * looks up to date. The marker is what makes that case detectable.
 */
export function isPreparedGlb(file) {
  if (!fs.existsSync(file)) return false;
  try {
    return (readGlb(file).json.asset?.generator ?? "").includes(MARKER);
  } catch {
    return false;
  }
}

export function prepareCharacterGlb(inputFile, outputFile, { unlit = true } = {}) {
  const { json, bin } = readGlb(inputFile);
  const before = fs.statSync(inputFile).size;

  const materialsFixed = fixMaterialFlags(json);
  const renamed = fixNodeNames(json);

  // Every accessor is pulled out up front, so the atlas step can edit UVs in
  // place and the rebuild can write them back without re-reading the old bin.
  const accessorData = new Map();
  json.accessors.forEach((_, index) => {
    accessorData.set(index, readAccessor(json, bin, index));
  });
  const uvData = new Map();
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const uv = primitive.attributes?.TEXCOORD_0;
      if (uv !== undefined) uvData.set(uv, accessorData.get(uv));
    }
  }

  const atlas = atlasMaterials(json, bin, uvData, { unlit });
  const rebuilt = rebuildBuffer(json, accessorData, atlas?.atlas ?? null);

  json.asset = {
    ...json.asset,
    generator: `${json.asset?.generator ?? "unknown"} + ${MARKER}`,
  };

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  writeGlb(outputFile, json, rebuilt);
  const after = fs.statSync(outputFile).size;

  return { materialsFixed, renamed, atlas, unlit, before, after };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const unlit = !args.includes("--lit");
  const [input, output] = args.filter((a) => !a.startsWith("--"));
  if (!input || !output) {
    console.error(
      "usage: node tools/prepare-character-glb.mjs <in.glb> <out.glb> [--lit]"
    );
    process.exit(1);
  }

  const result = prepareCharacterGlb(input, output, { unlit });
  console.log(`materials un-masked / un-double-sided: ${result.materialsFixed}`);
  for (const line of result.renamed) console.log(`renamed node  ${line}`);
  if (result.atlas) {
    console.log(
      `atlased ${result.atlas.count} textures into one ${ATLAS_SIZE}x${ATLAS_SIZE} ` +
        `sheet (${result.atlas.usedHeight}px used)`
    );
  }
  console.log(`shading: ${result.unlit ? "unlit (KHR_materials_unlit)" : "lit"}`);
  console.log(
    `${input} -> ${output}  ${(result.before / 1048576).toFixed(2)}MB -> ` +
      `${(result.after / 1048576).toFixed(2)}MB`
  );
}
