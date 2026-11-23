/**
 * Builds the organised animation library: one file per distinct motion, filed
 * by what it is for.
 *
 * Run from the project root, after tools/classify-animation-library.mjs:
 *
 *     node tools/organize-animation-library.mjs [catalog] [out-dir]
 *
 * Defaults: `assets/animations/catalog.json` -> `assets/local/animations/library`.
 *
 * Layout:
 *
 *   moves/actor/<moveset category>/   the performer's side of a move
 *   moves/target/<moveset category>/  the receiver's side, paired with it
 *   common/<family>/                  shared by every wrestler; families from
 *                                     docs/combat/no-mercy-hfsm-plan.md §2.6
 *   taunts/<group>/
 *   unknown/unnamed/                  no game names it
 *   unknown/unassigned-move/          named, but no moveset or rule places it
 *   sources/<game>.manifest.json      each game's original manifest, kept for
 *                                     the full moveset detail (which wrestler
 *                                     uses a clip, in which slot)
 *
 * Each file is `<name>-<motion>.glb`, where `motion` is the hash the catalog
 * gives the keyframes. Of the copies of a motion, the one the catalog lists
 * first - No Mercy where it has one - is kept, and named from whichever copy
 * knows a name. `catalog.json` in the output records every copy's game, file
 * number and name, so nothing the source sets said is lost.
 *
 * Copies, never moves: the source folders are left for the caller to remove
 * once the library has been checked.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function slug(text) {
  return (text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .replace(/-$/, "");
}

function folderFor(entry) {
  switch (entry.role) {
    case "actor":
      return path.join("moves", "actor", entry.group);
    case "target":
      return path.join("moves", "target", entry.group);
    case "common":
      return path.join("common", entry.group);
    case "taunt":
      return path.join("taunts", entry.group);
    default:
      return path.join("unknown", entry.group);
  }
}

export function organizeLibrary(catalogFile, outDir) {
  const catalog = JSON.parse(fs.readFileSync(catalogFile, "utf8"));
  const libraryRoot = path.dirname(catalogFile);

  // Copies of each motion, in catalog order.
  const motions = new Map();
  for (const clip of catalog.clips) {
    const copies = motions.get(clip.motion) ?? [];
    copies.push(clip);
    motions.set(clip.motion, copies);
  }

  // Source clip (set + file number) -> motion, so pairs can be re-expressed
  // between motions rather than between game-specific file numbers.
  const motionOf = new Map(catalog.clips.map((c) => [`${c.set}/${c.file}`, c.motion]));

  const entries = [];
  for (const [motion, copies] of motions) {
    const kept = copies[0];
    const name = copies.find((c) => c.name)?.name ?? null;
    const label = slug(name) || "unnamed";
    const file = path.join(folderFor(kept), `${label}-${motion}.glb`);

    const target = path.join(outDir, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(libraryRoot, kept.glb), target);

    const pairs = new Set();
    for (const copy of copies) {
      for (const partner of copy.pairs) pairs.add(motionOf.get(`${copy.set}/${partner}`));
    }
    pairs.delete(motion);

    entries.push({
      motion,
      file: file.split(path.sep).join("/"),
      name,
      role: kept.role,
      side: kept.side ?? null,
      group: kept.group,
      seconds: kept.seconds,
      pairs: [...pairs].filter(Boolean).sort(),
      sources: copies.map((c) => ({
        game: catalog.sets[c.set].game,
        file: c.file,
        name: c.borrowedFrom ? null : c.name,
        role: c.role,
        usedBy: c.usedBy,
      })),
    });
  }

  entries.sort((a, b) => a.file.localeCompare(b.file));
  const out = {
    note:
      "Reference animation extracted from the N64 AKI games. Local only: " +
      "do not commit or distribute. Bone names match the AKI rig.",
    games: Object.values(catalog.sets).map((s) => s.game),
    count: entries.length,
    motions: entries,
  };
  fs.writeFileSync(path.join(outDir, "catalog.json"), JSON.stringify(out, null, 1));

  fs.mkdirSync(path.join(outDir, "sources"), { recursive: true });
  for (const [set, info] of Object.entries(catalog.sets)) {
    fs.copyFileSync(
      path.join(libraryRoot, set, "manifest.json"),
      path.join(outDir, "sources", `${slug(info.game)}.manifest.json`)
    );
  }
  return out;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const catalogFile = process.argv[2] ?? "assets/animations/catalog.json";
  const outDir = process.argv[3] ?? "assets/local/animations/library";
  if (fs.existsSync(outDir) && fs.readdirSync(outDir).length) {
    console.error(`${outDir} is not empty; remove it first to rebuild`);
    process.exit(1);
  }

  const result = organizeLibrary(catalogFile, outDir);
  const folders = new Map();
  for (const entry of result.motions) {
    const top = entry.file.split("/").slice(0, entry.role === "actor" || entry.role === "target" ? 2 : 1).join("/");
    folders.set(top, (folders.get(top) ?? 0) + 1);
  }
  for (const [folder, count] of [...folders].sort()) console.log(`${String(count).padStart(5)}  ${folder}/`);
  console.log(`\n${result.count} motions written to ${outDir}`);
}
