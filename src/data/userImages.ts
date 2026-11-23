import { resolveAsset } from "./assets";
import { saves } from "./save/runtime";
import { isUserImageRef, userImageId } from "./save/images";

/**
 * Object URLs for imported images, shared by whatever currently shows them.
 *
 * Blob URLs live only as long as this page and are never stored as an image's
 * identity. A URL is revoked when its last holder releases it, and holders
 * acquire before releasing, so an arena reloaded with the same image keeps
 * the same URL.
 */
const live = new Map<string, { url: string; holders: number }>();

export interface ImageUrls {
  /** A texture value as a URL: bundled paths through the asset map, imported images through their object URL. */
  resolve(value: string): string | null;
  /** Imported images that could not be loaded. */
  warnings: string[];
  release(): void;
}

export async function acquireImageUrls(values: Iterable<string>): Promise<ImageUrls> {
  const ids = [...new Set([...values].map(userImageId).filter((id): id is string => id !== null))];
  const warnings: string[] = [];
  let blobs = new Map<string, Blob>();
  const unread = ids.filter((id) => !live.has(id));
  if (unread.length) {
    try { blobs = await saves.readImages(unread); }
    catch (error) { warnings.push(error instanceof Error ? error.message : String(error)); }
  }
  // Another holder may have created a URL while the bytes were read.
  const held: string[] = [];
  for (const id of ids) {
    let entry = live.get(id);
    if (!entry) {
      const blob = blobs.get(id);
      if (!blob) continue;
      entry = { url: URL.createObjectURL(blob), holders: 0 };
      live.set(id, entry);
    }
    entry.holders++;
    held.push(id);
  }
  let released = false;
  return {
    warnings,
    resolve(value) {
      if (!isUserImageRef(value)) return resolveAsset(value);
      const id = userImageId(value);
      return id && held.includes(id) ? live.get(id)!.url : null;
    },
    release() {
      if (released) return;
      released = true;
      for (const id of held) {
        const entry = live.get(id)!;
        if (--entry.holders === 0) { URL.revokeObjectURL(entry.url); live.delete(id); }
      }
    },
  };
}
