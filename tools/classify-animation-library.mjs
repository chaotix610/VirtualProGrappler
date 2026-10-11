/**
 * Sorts the extracted AKI animation libraries into what each clip is for.
 *
 * Run from the project root:
 *
 *     node tools/classify-animation-library.mjs [library-dir]
 *
 * `library-dir` (default `assets/animations`) holds one folder per extracted
 * game, each with a `manifest.json` listing its clips. The manifests say what a
 * clip is called and which movesets use it, in which role; they do not say what
 * the clip is *for*. This works that out and writes it to
 * `<library-dir>/catalog.json`, one entry per clip:
 *
 *   role    actor     performs a move (a moveset uses it as the attacker)
 *           target    receives a move (the opponent's half of a pair)
 *           common    engine-owned and shared by everyone: walking, getting
 *                     up, the lock-up, being hit
 *           taunt     taunts and poses
 *           unknown   unnamed, or named in a way no rule recognises
 *   group   a finer bucket within the role: the moveset category for moves
 *           ("front-grapple-strong"), or a family for common clips
 *           ("locomotion", "get-ups")
 *   side    for either half of a two-wrestler clip, which half: "actor" or
 *           "target". Engine pairs carry it too - `Reversal (opponent)` is a
 *           common clip on the target side
 *   pairs   for an actor, the target clips played opposite it; for a target,
 *           the actor clips it answers
 *
 * The three games share most of their animation: 14,477 files hold 5,583
 * distinct motions. Each entry carries a `motion` id, a hash of its keyframe
 * data, so copies can be told apart from look-alikes; and where one copy is
 * named and another is not, the unnamed copy borrows the name and role
 * (`borrowedFrom`).
 *
 * Nothing is moved or renamed. The catalog is what a later step organises
 * the files by, and what the move editor can search.
 *
 * Clips are extracted from commercial games for reference. The manifests say
 * so: the catalog, like them, stays local and is never committed.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Engine-owned clips, by what the name starts with or contains. First match
 * wins, so the narrower families come first.
 *
 * The families are the No Mercy cartridge's own, from the animation
 * vocabulary in docs/mechanics/no-mercy-hfsm-plan.md §2.6, so a folder maps to
 * the HFSM states that play it. `pin`, `reversal` and `irish-whip` are added:
 * the plan gives them states of their own (§6.3, §2.4).
 */
const COMMON_GROUPS = [
  ["weapons", /weapon/i],
  ["referee", /^referee|counting a pin|asking for a give-up/i],
  ["tag", /reaching for a tag|making a tag|\btagged\b/i],
  ["ladder", /ladder/i],
  ["cage", /cage/i],
  ["hurt-locomotion", /hurt in the (head|body|arms|legs)/i],
  [
    "guard",
    /^(guard|blocking a grapple|countering a grapple|grapple attempt countered|catching a kick|kick caught)/i,
  ],
  ["tie-up", /^(grapple attempt|lock-up|leaping onto the opponent|running into each other|front headlock)/i],
  ["irish-whip", /^irish whip/i],
  ["reversal", /^reversal/i],
  ["pin", /^(pinning|pinned)\b/i],
  [
    "hit-reactions",
    /^(hit by a strike|staggering|doubled over|dazed|going down on one knee|knocked flat|writhing)/i,
  ],
  [
    "get-ups",
    /^(getting up|being picked up|picking up a downed|stepping over a wrestler|running up to a wrestler)/i,
  ],
  [
    "ground",
    /^(lying on the mat|hit while lying|rolling (sideways )?on the mat|rolling sideways|rolled over by|rolling the opponent over)/i,
  ],
  ["ropes", /bouncing off the ropes|across the ropes|over the top rope|rolling under the ropes/i],
  ["apron-exits", /^(leaving the ring|on the apron|grappl(ed|ing) from the apron)/i],
  ["corner", /^(leaning in the corner|stuck in the corner|hanging .*corner|hung upside down)/i],
  ["turnbuckle", /springing onto the turnbuckle|diving off the turnbuckle/i],
  ["misc", /^(back to a stance|turning to face|running into the ring steps)|during a move/i],
  ["locomotion", /^(standing|walk|run\b|run start|run stop|roll$)/i],
];

const TAUNT = /taunt|^pose\b|entrance|celebrat|victory/i;
const OPPONENT_SUFFIX = /\s*\(opponent\)\s*$/i;

/**
 * Moveset entries that say nothing about a clip's role. Revenge's slot tables
 * file 1,040 clips - 920 of them unnamed - under a catch-all "Hold" category,
 * and mark others unused outright.
 */
const NOT_EVIDENCE = /^(hold|unused\b)/i;

/** The moveset uses that actually tell us something. */
function evidence(clip) {
  return clip.usedBy.filter((u) => !NOT_EVIDENCE.test(u.category) && u.move !== "Unnamed motion");
}

/** Hash of a GLB's binary chunk: the keyframes, without the clip's name. */
function motionId(file) {
  const data = fs.readFileSync(file);
  const jsonLength = data.readUInt32LE(12);
  return crypto.createHash("sha1").update(data.subarray(20 + jsonLength)).digest("hex").slice(0, 12);
}

/**
 * Lets unrecognised copies of a motion take what a recognised copy knows.
 * Sets are visited in order, so a name from the first set is preferred.
 */
function shareAcrossCopies(clips) {
  const byMotion = new Map();
  for (const clip of clips) {
    const copies = byMotion.get(clip.motion) ?? [];
    copies.push(clip);
    byMotion.set(clip.motion, copies);
  }

  let borrowed = 0;
  for (const copies of byMotion.values()) {
    const known = copies.find((c) => c.role !== "unknown") ?? copies.find((c) => c.name);
    if (!known) continue;
    for (const copy of copies) {
      if (copy === known || copy.role !== "unknown") continue;
      copy.role = known.role;
      copy.group = known.group;
      copy.side = known.side;
      copy.name ??= known.name;
      copy.borrowedFrom = `${known.set}/${known.file}`;
      borrowed++;
    }
  }
  return { motions: byMotion.size, borrowed };
}

function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** A clip's role and group, before pairing fills in targets found only by pairing. */
function classify(clip) {
  const uses = evidence(clip);
  const actorUses = uses.filter((u) => u.role === "attacker");
  const targetUses = uses.filter((u) => u.role !== "attacker");
  const name = clip.name ?? "";

  // The name wins over the moveset role: Revenge lists every use as
  // "attacker", opponent halves included.
  if (OPPONENT_SUFFIX.test(name) || (targetUses.length && !actorUses.length)) {
    return { role: "target", group: null };
  }
  if (actorUses.length) {
    const group = slug(actorUses[0].category);
    return TAUNT.test(actorUses[0].category) ? { role: "taunt", group } : { role: "actor", group };
  }
  if (!name) return { role: "unknown", group: "unnamed" };
  if (TAUNT.test(name)) return { role: "taunt", group: "taunt" };

  for (const [group, pattern] of COMMON_GROUPS) {
    if (pattern.test(name)) return { role: "common", group };
  }

  // A named clip no moveset uses and no rule recognises: a move the game
  // ships but no wrestler has, by the look of the names. Kept apart from
  // moveset moves, since nothing says which role it plays.
  return { role: "unknown", group: "unassigned-move" };
}

/**
 * Links actor and target clips.
 *
 * The strong link is a moveset: the same wrestler, slot and move listed once
 * as attacker and once as opponent. Failing that, a clip named `X (opponent)`
 * is paired with the nearest earlier clip named `X`, which is how the files
 * are laid out - the opponent's half follows the attacker's.
 */
function pairClips(clips, entries) {
  const link = (actor, target) => {
    entries.get(actor.file).pairs.add(target.file);
    entries.get(target.file).pairs.add(actor.file);
  };

  const bySlot = new Map();
  for (const clip of clips) {
    for (const use of evidence(clip)) {
      const key = `${use.wrestler}|${use.slot}|${use.move}`;
      const slot = bySlot.get(key) ?? { actors: [], targets: [] };
      (use.role === "attacker" ? slot.actors : slot.targets).push(clip);
      bySlot.set(key, slot);
    }
  }
  for (const { actors, targets } of bySlot.values()) {
    for (const actor of actors) for (const target of targets) link(actor, target);
  }

  const sorted = [...clips].sort((a, b) => a.file - b.file);
  sorted.forEach((clip, index) => {
    const entry = entries.get(clip.file);
    if (entry.role !== "target" || entry.pairs.size || !clip.name) return;
    const base = clip.name.replace(OPPONENT_SUFFIX, "");
    for (let i = index - 1; i >= Math.max(0, index - 4); i--) {
      if (sorted[i].name === base) {
        link(sorted[i], clip);
        return;
      }
    }
  });

  // Settle each pair so both halves sort together. The target takes its
  // partner's group. A pair whose actor half is an engine clip - `Reversal`
  // and `Reversal (opponent)` - is engine-owned on both sides; a pair whose
  // actor half no moveset uses is still a move, just one nobody has.
  for (const entry of entries.values()) {
    if (entry.role !== "target") continue;
    const partners = [...entry.pairs].map((f) => entries.get(f)).filter((e) => e.role !== "target");
    const partner = partners.find((e) => e.role === "actor") ?? partners[0];
    if (!partner) {
      entry.group ??= "unpaired";
      continue;
    }

    if (partner.role === "unknown" && partner.group === "unassigned-move") partner.role = "actor";
    if (partner.role === "common") {
      entry.role = "common";
      entry.side = "target";
      partner.side ??= "actor";
    }
    entry.group = partner.group;
  }
  for (const entry of entries.values()) {
    if (entry.role === "actor" && entry.pairs.size) entry.side = "actor";
    if (entry.role === "target") entry.side = "target";
  }
}

export function classifyLibrary(libraryDir) {
  const sets = fs
    .readdirSync(libraryDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(libraryDir, d.name, "manifest.json")))
    .map((d) => d.name)
    .sort();

  const catalog = { generated: new Date().toISOString(), sets: {}, clips: [] };

  for (const set of sets) {
    const manifest = JSON.parse(fs.readFileSync(path.join(libraryDir, set, "manifest.json"), "utf8"));
    catalog.sets[set] = { game: manifest.game, count: manifest.clips.length };

    const entries = new Map();
    for (const clip of manifest.clips) {
      entries.set(clip.file, {
        set,
        file: clip.file,
        glb: `${set}/${clip.glb}`,
        motion: motionId(path.join(libraryDir, set, clip.glb)),
        name: clip.name,
        seconds: clip.seconds,
        ...classify(clip),
        side: null,
        pairs: new Set(),
        usedBy: clip.usedBy.length,
      });
    }
    pairClips(manifest.clips, entries);

    for (const entry of entries.values()) {
      catalog.clips.push({ ...entry, pairs: [...entry.pairs].sort((a, b) => a - b) });
    }
  }

  Object.assign(catalog, shareAcrossCopies(catalog.clips));
  return catalog;
}

/** Counts per set, role and group, for the console. */
function summarise(catalog) {
  const lines = [];
  for (const [set, info] of Object.entries(catalog.sets)) {
    const clips = catalog.clips.filter((c) => c.set === set);
    lines.push(`\n${set}  ${info.game}  (${info.count} clips)`);

    const roles = new Map();
    for (const clip of clips) {
      const groups = roles.get(clip.role) ?? new Map();
      groups.set(clip.group, (groups.get(clip.group) ?? 0) + 1);
      roles.set(clip.role, groups);
    }
    for (const [role, groups] of [...roles].sort((a, b) => a[0].localeCompare(b[0]))) {
      const total = [...groups.values()].reduce((a, b) => a + b, 0);
      const top = [...groups].sort((a, b) => b[1] - a[1]).slice(0, 6);
      lines.push(
        `  ${role.padEnd(8)} ${String(total).padStart(5)}   ` +
          top.map(([g, n]) => `${g} ${n}`).join(", ") +
          (groups.size > top.length ? `, +${groups.size - top.length} more` : "")
      );
    }

    const actors = clips.filter((c) => c.role === "actor");
    const paired = actors.filter((c) => c.pairs.length).length;
    lines.push(`  actors with a target half: ${paired} of ${actors.length}`);
  }
  return lines.join("\n");
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const libraryDir = process.argv[2] ?? "assets/animations";
  const catalog = classifyLibrary(libraryDir);
  const out = path.join(libraryDir, "catalog.json");
  fs.writeFileSync(out, JSON.stringify(catalog, null, 1));
  console.log(summarise(catalog));
  console.log(
    `\n${catalog.clips.length} clips, ${catalog.motions} distinct motions; ` +
      `${catalog.borrowed} unrecognised copies named from another copy`
  );
  console.log(`wrote ${out}`);
}
