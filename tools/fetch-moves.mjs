/**
 * Pulls the move catalog from the NocoDB table and writes it back as
 * data/moves/moves.json.
 *
 * NocoDB is a convenient place to edit 878 rows by hand, but its JSON is not
 * the shape the engine reads, so this does three jobs:
 *
 *  1. Pagination. The v3 API answers 25 records at a time and hands back a
 *     `next` URL; a plain GET returns only the first page. This follows the
 *     cursor to exhaustion rather than trusting any one page size.
 *  2. Field mapping. NocoDB names the display column `Title`, returns
 *     single-selects as one-element arrays, and adds CreatedAt/UpdatedAt that
 *     moves.schema.json rejects (`additionalProperties: false`).
 *  3. Null coercion. The spreadsheet import put the literal strings "null"
 *     and "-" in empty cells. `feature: "null"` fails the schema loudly, but
 *     `animation_id: "null"` matches the id pattern and would validate as a
 *     real animation id on every row - so empties are coerced here.
 *
 * Auth comes from NOCODB_TOKEN in the environment; never hardcode it.
 *
 *   NOCODB_TOKEN=... node tools/fetch-moves.mjs          # dry run, reports diff
 *   NOCODB_TOKEN=... node tools/fetch-moves.mjs --write  # overwrite moves.json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const MOVES = path.join(root, "data/moves/moves.json");

const BASE =
  "https://app.nocodb.com/api/v3/data/pihi9wkwaldv7ml/melqkgd0q7i9uqr/records";
const PAGE_SIZE = 1000;

const token = process.env.NOCODB_TOKEN;
if (!token) {
  console.error("NOCODB_TOKEN is not set. Export it and re-run.");
  process.exit(1);
}

/** Empty-cell sentinels the spreadsheet import left behind. */
const EMPTY = new Set(["", "-", "null", "NULL"]);
const blank = (v) => (v == null || EMPTY.has(String(v).trim()) ? null : String(v).trim());

/** Follows the `next` cursor until it runs out. */
async function fetchAll() {
  const records = [];
  let url = `${BASE}?pageSize=${PAGE_SIZE}`;
  let pages = 0;

  while (url) {
    const res = await fetch(url, {
      headers: { accept: "application/json", "xc-token": token },
    });
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText} fetching page ${pages + 1}`);
    }
    const body = await res.json();
    records.push(...body.records);
    pages += 1;
    url = body.next ?? null;
  }

  console.log(`fetched ${records.length} records over ${pages} page(s)`);
  return records;
}

/** NocoDB record -> a move in moves.schema.json shape. */
function toMove(record) {
  const f = record.fields;
  const where = `Id ${record.id} (${f.move_id ?? "?"})`;

  // A single-select comes back as a one-element array. Taking [0] blindly
  // would hide a second selection, so this refuses instead.
  if (!Array.isArray(f.position) || f.position.length !== 1) {
    throw new Error(`${where}: expected exactly one position, got ${JSON.stringify(f.position)}`);
  }

  const feature = blank(f.feature);
  if (feature !== null && feature !== "pin" && feature !== "submit") {
    throw new Error(`${where}: unexpected feature ${JSON.stringify(f.feature)}`);
  }

  return {
    move_id: f.move_id,
    name: f.Title,
    position: f.position[0],
    groups: f.groups ?? [],
    slot_ids: f.slot_ids ?? [],
    power: blank(f.power),
    ko: Boolean(f.ko),
    bleed: Boolean(f.bleed),
    feature,
    animation_id: blank(f.animation_id),
  };
}

const records = await fetchAll();
// Id tracks file order, and is the only stable key: 30 rows share a move_id
// with another row as deliberate power variants, so sorting by anything else
// would reorder or collapse them.
records.sort((a, b) => a.id - b.id);
const moves = records.map(toMove);

// Keep the envelope from the file on disk so the output stays schema-valid
// without restating the descriptions here.
const existing = JSON.parse(fs.readFileSync(MOVES, "utf8"));
const next = { ...existing, moves };

const before = JSON.stringify(existing.moves);
const after = JSON.stringify(moves);
console.log(
  `moves.json has ${existing.moves.length} rows, NocoDB returned ${moves.length}` +
    (before === after ? " - identical" : " - CONTENT DIFFERS")
);

if (process.argv.includes("--write")) {
  fs.writeFileSync(MOVES, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`wrote ${path.relative(root, MOVES)} - now run: npm run validate:data`);
} else {
  console.log("dry run; pass --write to overwrite moves.json");
}
