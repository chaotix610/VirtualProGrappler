import { ArenaData } from "./arenas";

/**
 * Talks to the dev-only endpoint that writes data/arenas/*.json.
 *
 * Saving is a development affordance, not a game feature: the endpoint comes
 * from a Vite plugin that only applies on `serve`. In a production build the
 * calls here fail, which is why `saveAvailable()` exists - the editor asks
 * first and says so plainly rather than offering a Save that cannot work.
 */

const ENDPOINT = "/__arena-editor";

export interface SaveResult {
  /** Whether the file did not exist before this save. */
  created: boolean;
  /** Repository-relative path that was written. */
  path: string;
}

/** Whether the arena files can be written from here. */
export async function saveAvailable(): Promise<boolean> {
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
 * Writes an arena to data/arenas/<id>.json.
 *
 * Throws with the server's own message on a rejected save, so a schema
 * violation reaches the editor as the specific field that was wrong rather
 * than a generic failure.
 */
export async function saveArena(arena: ArenaData): Promise<SaveResult> {
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
