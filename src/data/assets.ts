/**
 * Resolves the `assets/...` paths written in the JSON content files to real
 * URLs the browser can fetch.
 *
 * The content files (arenas, main menu) name their images by repository path,
 * which is what `assetPath` in the schemas requires and what makes the data
 * readable on its own. Those paths are not URLs: Vite serves `assets/runtime`
 * at the site root and nothing else, so `assets/textures/ui/button_a.png`
 * would 404 if handed straight to an `<img>`.
 *
 * Rather than duplicate ~21MB of art into the public directory and rewrite
 * every path, the referenced trees are globbed at build time and the authored
 * path is used as the lookup key. `assets/source` is deliberately not globbed:
 * it holds the ~235MB of Blender and Mixamo originals that feed the asset
 * pipeline and must never reach the bundle.
 */

const modules = import.meta.glob(
  [
    "../../assets/artwork/**/*.{png,jpg,jpeg,webp,gif}",
    "../../assets/textures/**/*.{png,jpg,jpeg,webp,gif}",
    "../../assets/textures/**/*.{ttf,woff,woff2}",
    "../../assets/glb/**/*.glb",
    // `raw/` holds unprocessed rips kept for reference, named as they came out
    // of the extractor. They are never referenced by the data, and one of them
    // contains a `#`, which is a fragment delimiter in a module specifier and
    // so cannot be resolved at all. Excluded on both counts.
    "!../../assets/textures/**/raw/**",
  ],
  { eager: true, query: "?url", import: "default" }
) as Record<string, string>;

/**
 * Authored repository path -> emitted URL.
 *
 * Glob keys arrive relative to this file, so the `../../` prefix is stripped
 * to get back to the path as the JSON files write it.
 */
const byRepoPath = new Map<string, string>();
for (const [key, url] of Object.entries(modules)) {
  byRepoPath.set(key.replace(/^(\.\.\/)+/, ""), url);
}

/**
 * Vite's publicDir. Everything under it is served at the site root instead of
 * being bundled, so `assets/runtime/models/x.glb` is fetched as `/models/x.glb`.
 *
 * These files are invisible to the bundler by design, so they cannot be looked
 * up in the glob above - the URL is derived from the path instead. Their
 * existence is checked at build time by tools/validate-data.mjs and
 * tools/promote-assets.mjs rather than here.
 */
const PUBLIC_DIR_PREFIX = "assets/runtime/";

/** Every bundled asset path. Excludes publicDir, which is not enumerable. */
export function knownAssetPaths(): string[] {
  return [...byRepoPath.keys()].sort();
}

/**
 * The URL for an authored repository path, or null when there is none.
 *
 * This is the single entry point for turning a path as written in the JSON
 * content files - or in config - into something the browser can fetch,
 * whichever tree the file actually lives in. Callers do not need to know
 * whether an asset is bundled or served from publicDir.
 */
export function resolveAsset(repoPath: string): string | null {
  if (repoPath.startsWith(PUBLIC_DIR_PREFIX)) {
    return `/${repoPath.slice(PUBLIC_DIR_PREFIX.length)}`;
  }
  return byRepoPath.get(repoPath) ?? null;
}

/**
 * The URL for an authored path, throwing when it is missing.
 *
 * Used where a missing image means the screen is broken rather than merely
 * degraded, so the failure surfaces at load instead of as an empty box.
 */
export function requireAsset(repoPath: string): string {
  const url = resolveAsset(repoPath);
  if (url === null) {
    throw new Error(
      `No bundled asset for "${repoPath}". Either the file is missing or it ` +
        `lives outside the trees globbed in src/data/assets.ts.`
    );
  }
  return url;
}

/**
 * Which of the given paths resolve to nothing.
 *
 * publicDir paths always resolve, since their URL is derived rather than
 * looked up - use the build-time validator to check those actually exist.
 */
export function missingAssets(repoPaths: Iterable<string>): string[] {
  const missing: string[] = [];
  for (const path of repoPaths) {
    if (resolveAsset(path) === null) missing.push(path);
  }
  return missing;
}
