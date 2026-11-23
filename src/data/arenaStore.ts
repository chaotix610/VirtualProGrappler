import { ArenaData } from "./arenas";
import { saves } from "./save/runtime";
import { libraryIds, validateArena } from "./save/validation";

/**
 * Where the arena editor writes, and the two places it can.
 *
 * Player-made arenas go into the selected local save (the browser's IndexedDB,
 * see src/data/save/). That works in every build, and backs up with the save.
 *
 * The bundled arenas in data/environments/arenas/ are authored through the
 * dev-only endpoint from tools/vite-arena-editor.mjs, which exists only under
 * `vite serve`. A production build has no endpoint, so `projectSaveAvailable()`
 * says so and the editor copies bundled arenas into the local save instead.
 * Neither destination is ever written as a side effect of the other.
 */

const ENDPOINT = "/__arena-editor";

export interface SaveResult {
  /** Whether this arena did not exist in that destination before. */
  created: boolean;
  /** Where it went, as the editor should report it. */
  path: string;
}

/** Whether the project's arena files can be written from here. */
export async function projectSaveAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${ENDPOINT}/status`);
    if (!res.ok) return false;
    const body = await res.json();
    return body?.writable === true;
  } catch {
    // A built app has no such endpoint; the network error is the answer.
    return false;
  }
}

/**
 * Writes an arena to data/environments/arenas/<id>.json.
 *
 * Checked here first, without a save's image library, so a draft naming an
 * imported image - which only a local save can hold - is refused before it
 * reaches the project. The server checks the schema again, and its message
 * comes back as the specific field that was wrong.
 */
export async function saveProjectArena(arena: ArenaData): Promise<SaveResult> {
  validateArena(arena);
  const res = await fetch(`${ENDPOINT}/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ arena }),
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const details = Array.isArray(body.details) ? `: ${body.details.join("; ")}` : "";
    throw new Error(`${body.error ?? `Save failed (${res.status})`}${details}`);
  }

  return { created: !!body.created, path: String(body.path ?? "") };
}

/**
 * Writes an arena into the selected local save.
 *
 * The coordinator validates and commits it in one transaction, and drops the
 * save's recovery draft for this arena on the way, since the draft is now the
 * saved arena. In a temporary session it lasts until the tab closes.
 */
export async function saveLocalArena(arena: ArenaData): Promise<SaveResult> {
  validateArena(arena, libraryIds(saves.activeSave));
  const created = !saves.activeSave.arenas.some((candidate) => candidate.id === arena.id);
  await saves.putArena(arena);
  const where = saves.status.mode === "persistent" ? "in" : "for this session in";
  return { created, path: `${arena.id} ${where} “${saves.activeSave.name}”` };
}
