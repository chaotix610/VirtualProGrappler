/**
 * Copies the shipped subset of assets/source into the trees the build can
 * actually reach.
 *
 * `assets/source` is the authoring tree: ~265MB of Blender, Quaternius, Mixamo
 * and raw GLB originals, deliberately excluded from both Vite's publicDir and
 * the glob in src/data/assets.ts. Nothing there is reachable at runtime.
 *
 * Rather than leaving "which files did we copy out, and to where" as tribal
 * knowledge, the manifest below is the answer, and running this script
 * reproduces a working asset tree from source. It is idempotent: unchanged
 * files are skipped, so it is safe to run any time.
 *
 *   npm run assets:promote          copy anything missing or stale
 *   npm run assets:promote -- --check   report drift, change nothing (CI)
 *
 * There are two runtime homes, because there are two ways an asset reaches the
 * browser:
 *
 *   assets/runtime/**  Vite's publicDir. Served at the site root, so
 *                      assets/runtime/models/x.glb is fetched as /models/x.glb.
 *                      This is where the game's own models and textures live.
 *
 *   assets/glb/**      Bundled by the glob in src/data/assets.ts and referenced
 *                      from JSON content by repository path.
 *
 * Both are resolved by the same `resolveAsset()` call, so consumers do not need
 * to know which tree a file came from.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const at = (...parts) => path.join(root, ...parts);

/**
 * The shipped subset. Everything the build needs out of assets/source, and
 * nowhere else — if a file is not listed here, it does not reach the browser.
 */
const MANIFEST = [
  {
    from: "assets/source/glb/ring/ring-standard.glb",
    to: "assets/runtime/models/ring-standard.glb",
    why: "the ring, shared by the match scene and the arena viewer",
  },
  {
    from: "assets/source/glb/arena/ring-steps.glb",
    to: "assets/glb/arena/ring-steps.glb",
    why: "placed twice by the arena renderer; not referenced by any arena file",
  },
  {
    from: "assets/source/glb/arena/arena-floor.glb",
    to: "assets/glb/arena/arena-floor.glb",
    why: "arenaParts in every data/arenas/*.json",
  },
  {
    from: "assets/source/glb/arena/barricade.glb",
    to: "assets/glb/arena/barricade.glb",
    why: "arenaParts in every data/arenas/*.json",
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

    if (!differs(fromPath, toPath)) continue;

    if (check) {
      stale.push(`${entry.to} is missing or out of date`);
      continue;
    }

    fs.mkdirSync(path.dirname(toPath), { recursive: true });
    fs.copyFileSync(fromPath, toPath);
    copied.push(`${entry.from} -> ${entry.to}`);
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
