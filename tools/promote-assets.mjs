/**
 * Copies the shipped subset of assets/source into the trees the build can
 * actually reach.
 *
 * `assets/source` is the authoring tree: Blender and raw GLB
 * originals, deliberately excluded from the glob in src/data/assets.ts.
 * Nothing there is reachable at runtime.
 *
 * Rather than leaving "which files did we copy out, and to where" as tribal
 * knowledge, the manifest below is the answer, and running this script
 * reproduces a working asset tree from source. It is idempotent: unchanged
 * files are skipped, so it is safe to run any time.
 *
 *   npm run assets:promote          copy anything missing or stale
 *   npm run assets:promote -- --check   report drift, change nothing (CI)
 *
 * Every destination is under assets/{characters,environments,ui}/, the trees
 * bundled by the glob in src/data/assets.ts. Code and JSON name them by
 * repository path and turn that into a URL with `resolveAsset()`.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isPreparedGlb, prepareCharacterGlb } from "./prepare-character-glb.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const at = (...parts) => path.join(root, ...parts);

/**
 * Fits the AKI export of Austin to the game.
 *
 * The export stands 3.635m tall in its clips (feet to crown, measured on the
 * idle pose); the previous Austin stood 1.812m, which the ring, the camera and
 * every movement constant are tuned around. Scaling on the root keeps the
 * clips valid, since their translations scale with it.
 *
 * Every clip faces -Z, the opposite of the glTF +Z forward the game assumes
 * (yaw 0 faces +Z), so the root is turned round.
 */
/** The local reference library; see tools/organize-animation-library.mjs. */
const LIBRARY = "assets/local/animations/library/common";

const AUSTIN_RIG = {
  scale: 1.812 / 3.635,
  yawDegrees: 180,
  rootJoint: "Pelvis",
  // The export's idle is an unnamed held pose. `idle` is the breathing stance
  // added below; the pose is kept under its own name.
  clipRenames: { NONE: "idle_pose" },
  // Exported with a single key: no length, nothing to play.
  dropClips: ["Baseball Slide"],
  /**
   * Shared clips his export lacks, from the reference library. Movement
   * style 0 is assumed for his locomotion: his No Mercy record names his
   * style "Wrestling", index 0, but not which movement style he uses.
   * No Mercy copies where they are clean; the sidesteps are WrestleMania
   * 2000's, whose No Mercy copies drift diagonally. Directions were checked
   * from which way the lifted foot swings: "one side" is his right.
   */
  extraClips: [
    { as: "idle", from: `${LIBRARY}/locomotion/standing-movement-style-0-c0ca580413f8.glb` },
    { as: "walk_forward", from: `${LIBRARY}/locomotion/walk-forward-movement-style-0-724cef0a83b3.glb` },
    { as: "walk_backward", from: `${LIBRARY}/locomotion/walk-backward-movement-style-0-bf4c46e4b465.glb` },
    { as: "walk_right", from: `${LIBRARY}/locomotion/walk-sideways-one-side-movement-style-0-49b88cb83c2f.glb` },
    { as: "walk_left", from: `${LIBRARY}/locomotion/walk-sideways-other-side-movement-style-0-932bc782d072.glb` },
    { as: "run", from: `${LIBRARY}/locomotion/run-movement-styles-0-to-3-bacb0f0bd6dd.glb` },
    { as: "guard", from: `${LIBRARY}/guard/guard-movement-styles-0-4-5-and-6-877eecc46924.glb` },
    { as: "rope_hit", from: `${LIBRARY}/ropes/bouncing-off-the-ropes-into-them-d335db33f1b6.glb` },
    // "Springing onto the turnbuckle, kind 3", Austin's own, via Blender -
    // which brings it back at 0.01 scale. Starts on the mat, ends crouched on
    // the top rope facing back into the ring.
    {
      as: "climb",
      from: "assets/animations/shared/turnbuckle/climbing/turnbuckle_climbing_climb.glb",
      translationScale: 100,
    },
  ],
};

/**
 * The shipped subset. Everything the build needs out of assets/source, and
 * nowhere else — if a file is not listed here, it does not reach the browser.
 *
 * Most entries are a straight copy. An entry with `via` is run through a
 * transform instead, for assets that need processing between the authoring
 * export and the runtime tree.
 */
const MANIFEST = [
  {
    from: "assets/source/glb/ring/ring-standard.glb",
    to: "assets/environments/arenas/shared/ring/models/ring-standard.glb",
    why: "the ring, shared by the match scene and the arena viewer",
  },
  {
    from: "assets/source/glb/arena/ring-steps.glb",
    to: "assets/environments/arenas/shared/ring/models/ring-steps.glb",
    why: "placed twice by the arena renderer; not referenced by any arena file",
  },
  {
    from: "assets/source/glb/arena/arena-floor.glb",
    to: "assets/environments/arenas/shared/models/floor/arena_floor.glb",
    why: "the RAW stage's ringside floor, listed in data/environments/stages.json",
  },
  {
    from: "assets/source/glb/arena/barricade.glb",
    to: "assets/environments/arenas/shared/models/barricade/padded_barricade.glb",
    why: "the RAW stage's ringside barricade, listed in data/environments/stages.json",
  },
  {
    from: "assets/source/characters/steve_austin.glb",
    to: "assets/characters/models/steve_austin.glb",
    // Unlit: the shading is painted into the textures, so the scene lights
    // must not apply a second pass of it.
    via: (from, to) =>
      prepareCharacterGlb(from, to, { unlit: true, rig: AUSTIN_RIG }),
    inputs: AUSTIN_RIG.extraClips.map((clip) => clip.from),
    why: "playable character; the AKI export needs its material flags " +
      "cleared, its 23 textures atlased, and its rig fitted before it is usable",
  },
];

/** Whether two files differ, by size then bytes. */
function differs(fromPath, toPath) {
  if (!fs.existsSync(toPath)) return true;
  const a = fs.statSync(fromPath);
  const b = fs.statSync(toPath);
  if (a.size !== b.size) return true;
  return !fs.readFileSync(fromPath).equals(fs.readFileSync(toPath));
}

/**
 * Whether a transformed output needs rebuilding.
 *
 * A transform's output never equals its input, so the byte comparison above
 * cannot answer this. Modification time is the usable signal: the output is
 * stale if it is missing or older than the source asset, any other file
 * the transform reads (`inputs`), or the transform itself, so editing the
 * tool rebuilds everything it produces.
 */
function transformStale(fromPath, toPath, inputs = []) {
  if (!fs.existsSync(toPath)) return true;
  // A raw export copied over the output is newer than its own source, so the
  // timestamps below would call it current. Ask the file what it is instead.
  if (!isPreparedGlb(toPath)) return true;

  const out = fs.statSync(toPath).mtimeMs;
  if (fs.statSync(fromPath).mtimeMs > out) return true;
  // Anything else the transform reads, such as clips merged in from the
  // reference library.
  if (inputs.some((input) => !fs.existsSync(at(input)) || fs.statSync(at(input)).mtimeMs > out)) {
    return true;
  }
  const tool = at("tools", "prepare-character-glb.mjs");
  return fs.existsSync(tool) && fs.statSync(tool).mtimeMs > out;
}

/** Copies anything missing or stale. Returns what it did, and any problems. */
export function promoteAssets({ check = false } = {}) {
  const copied = [];
  const stale = [];
  const missing = [];

  for (const entry of MANIFEST) {
    const fromPath = at(entry.from);
    const toPath = at(entry.to);

    if (!fs.existsSync(fromPath)) {
      missing.push(`${entry.from} is not in the source tree`);
      continue;
    }

    const outdated = entry.via
      ? transformStale(fromPath, toPath, entry.inputs)
      : differs(fromPath, toPath);
    if (!outdated) continue;

    if (check) {
      stale.push(`${entry.to} is missing or out of date`);
      continue;
    }

    fs.mkdirSync(path.dirname(toPath), { recursive: true });
    if (entry.via) {
      entry.via(fromPath, toPath);
      copied.push(`${entry.from} -> ${entry.to} (transformed)`);
    } else {
      fs.copyFileSync(fromPath, toPath);
      copied.push(`${entry.from} -> ${entry.to}`);
    }
  }

  return { copied, stale, missing };
}

// CLI entry point.
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const { copied, stale, missing } = promoteAssets({ check });

  for (const line of copied) console.log(`copied  ${line}`);
  for (const line of stale) console.error(`STALE   ${line}`);
  for (const line of missing) console.error(`MISSING ${line}`);

  if (missing.length || stale.length) {
    console.error(
      `\n${missing.length + stale.length} problem(s). ` +
        (stale.length ? "Run `npm run assets:promote` to fix." : "")
    );
    process.exit(1);
  }

  console.log(
    copied.length
      ? `\npromoted ${copied.length} file(s)`
      : "\nruntime assets are already up to date"
  );
}
