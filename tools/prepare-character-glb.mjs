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
 * their cell. Source UVs need not sit in [0,1]: the AKI export puts every part
 * in [2, 3.5] and lets mirrored-repeat samplers wrap it. An atlas cell cannot
 * wrap, so each cell holds the image already tiled - mirrored or repeated, as
 * its sampler says - over the whole tiles its UVs cover, and the UVs are
 * remapped across that. Clamping them to [0,1] instead collapses every UV onto
 * one texel and paints each part a flat colour.
 *
 * A file exported with its clips (the AKI rig) can also be given a `rig`
 * option, which fits the export to the game - see `prepareRig`:
 *
 *  4. Scale and facing are set on the root node, so every clip's translations
 *     scale and turn with it. Never per clip.
 *
 *  5. Clips are renamed to snake_case `animation_id`s, the original name kept
 *     in the clip's `extras.source_clip`. Broken clips are dropped.
 *
 *  6. Root motion is split out. The root joint's horizontal travel comes out
 *     of each clip, so the body plays in place over its root, and goes onto a
 *     `root_motion` node track instead - see `extractRootMotion`.
 *
 *  7. Shared clips are added from skeleton-only GLBs on the same rig -
 *     walking, running, guarding - which a character's own export does not
 *     carry. See `addClips`.
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
  // clips - rig joints are PascalCase and have to stay that way - whereas part
  // names are ours to normalise.
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

const REPEAT = 10497;
const MIRRORED_REPEAT = 33648;

/**
 * Whole tiles covering a UV span: from the tile the lowest UV falls in to the
 * one the highest does. Overshoots under 0.01 - sub-texel rounding at a tile's
 * edge - do not earn a tile of their own.
 */
function tileRange(span) {
  if (!span) return { u0: 0, nu: 1, v0: 0, nv: 1 };
  const EPS = 0.01;
  const axis = (lo, hi) => {
    const start = Math.floor(lo + EPS);
    const end = Math.max(start + 1, Math.ceil(hi - EPS));
    return [start, end - start];
  };
  const [u0, nu] = axis(span.u0, span.u1);
  const [v0, nv] = axis(span.v0, span.v1);
  return { u0, nu, v0, nv };
}

/**
 * Lays an image out over `tiles` the way its sampler wraps it, so sampling
 * the result at [0,1] matches sampling the original across the whole span.
 * Mirrored repeat flips every odd tile; plain repeat copies it. Clamp is not
 * handled: an export clamping a span wider than one tile would need its edge
 * texels stretched, and none does.
 */
function tileImage(source, { u0, nu, v0, nv }, wrap) {
  if (nu === 1 && nv === 1 && u0 % 2 === 0 && v0 % 2 === 0) return source;
  const { width: w, height: h } = source;
  const out = new PNG({ width: w * nu, height: h * nv });

  for (let ty = 0; ty < nv; ty++) {
    const flipY = wrap.t === MIRRORED_REPEAT && (v0 + ty) % 2 !== 0;
    for (let tx = 0; tx < nu; tx++) {
      const flipX = wrap.s === MIRRORED_REPEAT && (u0 + tx) % 2 !== 0;
      for (let y = 0; y < h; y++) {
        const sy = flipY ? h - 1 - y : y;
        for (let x = 0; x < w; x++) {
          const sx = flipX ? w - 1 - x : x;
          const from = (sy * w + sx) * 4;
          const to = ((ty * h + y) * out.width + tx * w + x) * 4;
          source.data.copy(out.data, to, from, from + 4);
        }
      }
    }
  }
  return out;
}

/**
 * Fix 3: one material, one texture. Every primitive's UVs are remapped into
 * its old texture's cell in the atlas.
 */
function atlasMaterials(json, bin, uvData, { unlit }) {
  // Material index -> the image it sampled, so a primitive can find its cell;
  // image index -> how its sampler wraps.
  const imageOfMaterial = new Map();
  const wrapOfImage = new Map();
  (json.materials ?? []).forEach((material, index) => {
    const texture = material.pbrMetallicRoughness?.baseColorTexture;
    if (!texture) return;
    const { source, sampler } = json.textures[texture.index];
    imageOfMaterial.set(index, source);
    const s = json.samplers?.[sampler] ?? {};
    wrapOfImage.set(source, { s: s.wrapS ?? REPEAT, t: s.wrapT ?? REPEAT });
  });

  // The whole-tile range of UV space each image is sampled across. An export
  // can place its UVs anywhere and let the sampler wrap them - the AKI file
  // sits every part in [2, 3.5] - so the cell has to hold that many tiles.
  const spanOfImage = new Map();
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const uv = primitive.attributes?.TEXCOORD_0;
      const imageIndex = imageOfMaterial.get(primitive.material);
      if (uv === undefined || imageIndex === undefined) continue;
      const span = spanOfImage.get(imageIndex) ?? { u0: Infinity, u1: -Infinity, v0: Infinity, v1: -Infinity };
      const buffer = uvData.get(uv);
      for (let i = 0; i < buffer.length; i += 8) {
        const u = buffer.readFloatLE(i);
        const v = buffer.readFloatLE(i + 4);
        span.u0 = Math.min(span.u0, u);
        span.u1 = Math.max(span.u1, u);
        span.v0 = Math.min(span.v0, v);
        span.v1 = Math.max(span.v1, v);
      }
      spanOfImage.set(imageIndex, span);
    }
  }

  const images = (json.images ?? []).map((image, index) => {
    const source = PNG.sync.read(trimPng(Buffer.from(readBufferView(json, bin, image.bufferView))));
    const tiles = tileRange(spanOfImage.get(index));
    const png = tileImage(source, tiles, wrapOfImage.get(index) ?? { s: REPEAT, t: REPEAT });
    return { index, width: png.width, height: png.height, png, tiles };
  });
  if (!images.length) return null;
  const tilesOfImage = new Map(images.map((image) => [image.index, image.tiles]));

  const { cells, usedHeight } = packCells(images);

  const atlas = new PNG({ width: ATLAS_SIZE, height: ATLAS_SIZE });
  atlas.data.fill(0);
  for (const image of images) blit(atlas, image.png, cells.get(image.index));

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

      const { u0, nu, v0, nv } = tilesOfImage.get(imageIndex);
      const buffer = uvData.get(uv);
      for (let i = 0; i < buffer.length; i += 8) {
        // Into the cell's own [0,1], across however many tiles it holds. The
        // clamp only absorbs sub-texel rounding at the cell's edge.
        const u = Math.min(Math.max((buffer.readFloatLE(i) - u0) / nu, 0), 1);
        const v = Math.min(Math.max((buffer.readFloatLE(i + 4) - v0) / nv, 0), 1);
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

// --- rig -------------------------------------------------------------------

/** Name of the node the extracted root motion is keyed onto. */
export const ROOT_MOTION_NODE = "root_motion";

/** `Austin Punch` -> `austin_punch`, `Stomp (16868)` -> `stomp_16868`. */
export function clipId(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Per-component min and max of packed float VEC3s, as an accessor wants. */
function vec3Bounds(buffer) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < buffer.length; i += 12) {
    for (let c = 0; c < 3; c++) {
      const v = buffer.readFloatLE(i + c * 4);
      min[c] = Math.min(min[c], v);
      max[c] = Math.max(max[c], v);
    }
  }
  return { min, max };
}

/** Hamilton product, [x, y, z, w]. */
function multiplyQuat(a, b) {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/** Rotates vector `v` by unit quaternion `q`. */
function rotateVector(q, v) {
  const [x, y, z] = multiplyQuat(multiplyQuat(q, [...v, 0]), [-q[0], -q[1], -q[2], q[3]]);
  return [x, y, z];
}

/**
 * Fix 4: scale and turn the whole character on its root node.
 *
 * Applied to the root rather than baked into vertices or keys, so the bind
 * pose, the skin and every clip stay exactly as exported and simply inherit
 * it.
 */
function fitRoot(json, { scale = 1, yawDegrees = 0 }) {
  const roots = json.scenes?.[json.scene ?? 0]?.nodes ?? [];
  if (roots.length !== 1) {
    throw new Error(`expected one scene root to fit, found ${roots.length}`);
  }
  const root = json.nodes[roots[0]];

  const half = (yawDegrees * Math.PI) / 360;
  const yaw = [0, Math.sin(half), 0, Math.cos(half)];
  root.rotation = multiplyQuat(yaw, root.rotation ?? [0, 0, 0, 1]);
  root.scale = (root.scale ?? [1, 1, 1]).map((s) => s * scale);

  return roots[0];
}

/** Fix 5: snake_case ids, original names kept, broken clips dropped. */
function renameClips(json, { clipRenames = {}, dropClips = [] }) {
  const dropped = [];
  json.animations = (json.animations ?? []).filter((animation) => {
    if (dropClips.includes(animation.name)) {
      dropped.push(animation.name);
      return false;
    }
    return true;
  });

  const seen = new Set();
  for (const animation of json.animations) {
    const id = clipRenames[animation.name] ?? clipId(animation.name);
    if (seen.has(id)) throw new Error(`two clips map to the id "${id}"`);
    seen.add(id);
    animation.extras = { ...animation.extras, source_clip: animation.name };
    animation.name = id;
  }

  // Dropped clips leave their accessors behind; rebuildBuffer prunes them.
  return dropped;
}

/**
 * Fix 6: take the root joint's horizontal travel out of every clip.
 *
 * The exported clips walk the body away from its root: a punch steps 0.4m
 * forward, a clothesline runs 2.5m. Left in, the wrestler drifts off his own
 * root node during a move and snaps back when it ends, and the game cannot
 * know where he finished.
 *
 * So each clip's root joint is pinned to its first-frame X/Z - height and
 * rotation stay, which keeps the bob, the sway and every drop to the mat -
 * and the travel goes onto a `root_motion` node of its own, keyed on the same
 * times. That node is a scene root, so its keys are already in model space:
 * metres, after the root's scale and facing, with +Z forward. It starts every
 * clip at zero. The game reads it and moves the wrestler's root by the change
 * each frame.
 */
function extractRootMotion(json, accessorData, rootIndex, jointName) {
  const joint = json.nodes.findIndex((n) => n.name === jointName);
  if (joint < 0) throw new Error(`no root joint named ${jointName}`);
  if (!(json.nodes[rootIndex].children ?? []).includes(joint)) {
    throw new Error(`${jointName} must be a direct child of the scene root`);
  }

  const root = json.nodes[rootIndex];
  const rotation = root.rotation ?? [0, 0, 0, 1];
  const scale = root.scale ?? [1, 1, 1];
  const toModel = ([x, y, z]) => rotateVector(rotation, [x * scale[0], y * scale[1], z * scale[2]]);

  json.nodes.push({ name: ROOT_MOTION_NODE });
  const motionNode = json.nodes.length - 1;
  json.scenes[json.scene ?? 0].nodes.push(motionNode);

  const claimed = new Set();
  const travel = [];

  for (const animation of json.animations ?? []) {
    const channel = animation.channels.find(
      (c) => c.target.node === joint && c.target.path === "translation"
    );
    if (!channel) continue;

    const sampler = animation.samplers[channel.sampler];
    if ((sampler.interpolation ?? "LINEAR") !== "LINEAR") {
      throw new Error(`${animation.name}: root joint keys are ${sampler.interpolation}, not LINEAR`);
    }
    // Pinning edits the keys in place, which would corrupt any other clip
    // reading the same accessor.
    if (claimed.has(sampler.output)) {
      throw new Error(`${animation.name}: root joint keys are shared with another clip`);
    }
    claimed.add(sampler.output);

    const keys = accessorData.get(sampler.output);
    const startX = keys.readFloatLE(0);
    const startZ = keys.readFloatLE(8);
    const motion = Buffer.alloc(keys.length);

    for (let i = 0; i < keys.length; i += 12) {
      const dx = keys.readFloatLE(i) - startX;
      const dz = keys.readFloatLE(i + 8) - startZ;
      keys.writeFloatLE(startX, i);
      keys.writeFloatLE(startZ, i + 8);

      const [mx, , mz] = toModel([dx, 0, dz]);
      motion.writeFloatLE(mx, i);
      motion.writeFloatLE(0, i + 4);
      motion.writeFloatLE(mz, i + 8);
    }

    const count = keys.length / 12;
    const last = (count - 1) * 12;
    const end = [motion.readFloatLE(last), 0, motion.readFloatLE(last + 8)];
    json.accessors.push({ componentType: 5126, count, type: "VEC3", ...vec3Bounds(motion) });
    accessorData.set(json.accessors.length - 1, motion);

    animation.samplers.push({
      input: sampler.input,
      output: json.accessors.length - 1,
      interpolation: "LINEAR",
    });
    animation.channels.push({
      sampler: animation.samplers.length - 1,
      target: { node: motionNode, path: "translation" },
    });

    travel.push({ clip: animation.name, distance: Math.hypot(end[0], end[2]) });
  }

  return travel;
}

/**
 * Drops accessors nothing references any more - those of a dropped clip - and
 * renumbers the rest. Returns the accessor data under the new indices.
 */
function pruneAccessors(json, accessorData) {
  const refs = [];
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      refs.push([primitive, "indices"]);
      for (const key of Object.keys(primitive.attributes ?? {})) refs.push([primitive.attributes, key]);
      for (const target of primitive.targets ?? []) {
        for (const key of Object.keys(target)) refs.push([target, key]);
      }
    }
  }
  for (const skin of json.skins ?? []) refs.push([skin, "inverseBindMatrices"]);
  for (const animation of json.animations ?? []) {
    for (const sampler of animation.samplers) refs.push([sampler, "input"], [sampler, "output"]);
  }

  const used = [...new Set(refs.map(([o, k]) => o[k]).filter((i) => i !== undefined))].sort(
    (a, b) => a - b
  );
  const renumber = new Map(used.map((old, index) => [old, index]));
  for (const [owner, key] of refs) {
    if (owner[key] !== undefined) owner[key] = renumber.get(owner[key]);
  }

  json.accessors = used.map((old) => json.accessors[old]);
  return new Map(used.map((old, index) => [index, accessorData.get(old)]));
}

/**
 * Fix 7: adds clips from skeleton-only GLBs on the same rig - the shared
 * locomotion and reaction clips every wrestler plays, which a character's
 * own export does not carry.
 *
 * Channels are matched to this file's joints by name, so the source's own
 * root node (`Skeleton`, `Armature`) and any extra leaf bones (`Head_end`)
 * are ignored. The source must share the rig's units, which the AKI library
 * does (both roots scale 0.022 and `Pelvis` rests at 10 up), or say how far
 * off it is: `translationScale` multiplies its translation keys. A Blender
 * round trip of an AKI clip comes back at 0.01, so it takes 100.
 * Added after renaming and before root-motion extraction, so the clips keep
 * the ids given here and have their travel split out like every other clip.
 */
function addClips(json, accessorData, extraClips) {
  const nodeByName = new Map(json.nodes.map((n, i) => [n.name, i]));
  const added = [];

  for (const { from, as, translationScale = 1 } of extraClips) {
    if ((json.animations ?? []).some((a) => a.name === as)) {
      throw new Error(`extra clip "${as}" would replace a clip the export already has`);
    }
    if (!fs.existsSync(from)) throw new Error(`extra clip source not found: ${from}`);
    const source = readGlb(from);
    const animation = source.json.animations?.[0];
    if (!animation) throw new Error(`${from} has no animation`);

    // Accessors are copied across as they are referenced, each once.
    const copied = new Map();
    const copy = (index, scale = 1) => {
      if (!copied.has(index)) {
        // The data is re-packed by rebuildBuffer, so the old placement goes.
        const accessor = { ...source.json.accessors[index] };
        delete accessor.bufferView;
        delete accessor.byteOffset;
        const data = readAccessor(source.json, source.bin, index);
        if (scale !== 1) {
          for (let i = 0; i < data.length; i += 4) data.writeFloatLE(data.readFloatLE(i) * scale, i);
          if (accessor.min) accessor.min = accessor.min.map((v) => v * scale);
          if (accessor.max) accessor.max = accessor.max.map((v) => v * scale);
        }
        json.accessors.push(accessor);
        accessorData.set(json.accessors.length - 1, data);
        copied.set(index, json.accessors.length - 1);
      }
      return copied.get(index);
    };

    const samplers = [];
    const channels = [];
    for (const channel of animation.channels) {
      const name = source.json.nodes[channel.target.node]?.name;
      const node = nodeByName.get(name);
      if (node === undefined) continue;
      const sampler = animation.samplers[channel.sampler];
      const scale = channel.target.path === "translation" ? translationScale : 1;
      samplers.push({ ...sampler, input: copy(sampler.input), output: copy(sampler.output, scale) });
      channels.push({ sampler: samplers.length - 1, target: { node, path: channel.target.path } });
    }
    if (!channels.length) throw new Error(`${from} shares no joints with this rig`);

    json.animations.push({
      name: as,
      channels,
      samplers,
      extras: { source_clip: animation.name, source_file: path.basename(from) },
    });
    added.push(as);
  }
  return added;
}

/** Fixes 4-7, in the order they depend on each other. */
function prepareRig(json, accessorData, rig) {
  const rootIndex = fitRoot(json, rig);
  const dropped = renameClips(json, rig);
  const added = addClips(json, accessorData, rig.extraClips ?? []);
  const travel = extractRootMotion(json, accessorData, rootIndex, rig.rootJoint ?? "Pelvis");
  return { dropped, added, clips: json.animations.length, travel };
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

/**
 * `rig`, when given, fits a file exported with its clips to the game:
 *   scale        multiplies the root node's scale
 *   yawDegrees   turns the root node about +Y
 *   rootJoint    the joint whose horizontal travel becomes root motion
 *   clipRenames  source clip name -> id, where snake_case is not wanted
 *   dropClips    source clip names to leave out
 *   extraClips   [{ from, as, translationScale? }]: clips to add from GLBs
 *                on the same rig, each under the id `as`
 */
export function prepareCharacterGlb(inputFile, outputFile, { unlit = true, rig = null } = {}) {
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
  const rigged = rig ? prepareRig(json, accessorData, rig) : null;
  const rebuilt = rebuildBuffer(json, pruneAccessors(json, accessorData), atlas?.atlas ?? null);

  json.asset = {
    ...json.asset,
    generator: `${json.asset?.generator ?? "unknown"} + ${MARKER}`,
  };

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  writeGlb(outputFile, json, rebuilt);
  const after = fs.statSync(outputFile).size;

  return { materialsFixed, renamed, atlas, rigged, unlit, before, after };
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
