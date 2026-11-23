/**
 * Dev-only endpoints backing the Arena Editor.
 *
 * The editor runs in the browser, but arenas live in data/arenas/*.json, which
 * is outside publicDir and imported at build time - so there is no way for the
 * page to persist a change on its own. This plugin gives it one, over the dev
 * server that is already running.
 *
 * `apply: "serve"` is what keeps it honest: the plugin is not part of a
 * production build, so nothing ships an endpoint that writes to the repo. In a
 * built app the editor's save simply has nowhere to call, which is why it
 * checks availability before offering to save.
 *
 * Writes are confined to data/arenas/<id>.json, with the id re-derived from
 * the schema's own pattern rather than taken from the request, so a crafted
 * body cannot address a path outside that directory.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const ARENA_DIR = path.join(root, "data", "arenas");
const SCHEMA_PATH = path.join(root, "data", "schemas", "arenas.schema.json");

/** Mirrors the schema's arena_id pattern. */
const ID_PATTERN = /^[a-z][a-z0-9_]*$/;

const ENDPOINT = "/__arena-editor";

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      // An arena file is a couple of KB; anything approaching a megabyte is
      // not one, so stop reading rather than buffer it.
      if (body.length > 1_000_000) reject(new Error("Body too large"));
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (error) {
        reject(new Error(`Body is not JSON: ${error.message}`));
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

export function arenaEditorPlugin() {
  let validate = null;

  return {
    name: "vpg-arena-editor",
    apply: "serve",

    configureServer(server) {
      // Compiled once per dev-server start. Re-read per request would pick up
      // schema edits, but the schema changes far less often than the data and
      // a stale compile would be confusing rather than helpful.
      const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));
      validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith(ENDPOINT)) return next();

        const url = new URL(req.url, "http://localhost");

        // Lets the editor tell "running under the dev server, saving works"
        // from "built app, saving is unavailable" without attempting a write.
        if (url.pathname === `${ENDPOINT}/status` && req.method === "GET") {
          return send(res, 200, { writable: true, dir: "data/arenas" });
        }

        if (url.pathname === `${ENDPOINT}/save` && req.method === "POST") {
          try {
            const body = await readJsonBody(req);
            const arena = body?.arena;

            if (!arena || typeof arena !== "object") {
              return send(res, 400, { error: "Missing `arena` object." });
            }

            const id = String(arena.id ?? "");
            if (!ID_PATTERN.test(id)) {
              return send(res, 400, {
                error: `Invalid arena id "${id}". Expected ${ID_PATTERN}.`,
              });
            }

            if (!validate(arena)) {
              return send(res, 422, {
                error: "Arena does not match the schema.",
                details: validate.errors.map(
                  (e) => `${e.instancePath || "/"} ${e.message}`
                ),
              });
            }

            // Built from the validated id, so the path cannot escape the
            // arena directory however the request was shaped.
            const file = path.join(ARENA_DIR, `${id}.json`);
            const created = !fs.existsSync(file);

            // Trailing newline so the file matches what an editor would write
            // and does not show up as a one-line diff against its neighbours.
            fs.writeFileSync(file, `${JSON.stringify(arena, null, 2)}\n`, "utf8");

            return send(res, 200, {
              ok: true,
              created,
              path: `data/arenas/${id}.json`,
            });
          } catch (error) {
            return send(res, 400, { error: String(error.message ?? error) });
          }
        }

        return send(res, 404, { error: "Unknown arena-editor endpoint." });
      });
    },
  };
}
