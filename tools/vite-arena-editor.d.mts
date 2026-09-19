import type { Plugin } from "vite";

/**
 * Dev-only Vite plugin serving the Arena Editor's save endpoint.
 *
 * Applies on `serve` only, so it is absent from production builds.
 */
export function arenaEditorPlugin(): Plugin;
