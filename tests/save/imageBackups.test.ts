import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { encodeBackup, decodeBackup } from "../../src/data/save/archive";
import { firstWorkspace } from "../../src/data/save/migrations";
import { LIMITS, type BackupSnapshot, type LibraryImage } from "../../src/data/save/types";
import { sha256Hex, userImageRef } from "../../src/data/save/images";
import { arenaById } from "../../src/data/arenas";
import { cloneArena, draftToJson } from "../../src/data/arenaDraft";

function png(width: number, height: number, padding: number, seed: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(33 + padding);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13); view.setUint32(12, 0x49484452); view.setUint32(16, width); view.setUint32(20, height);
  // Incompressible filler, like real image data, in getRandomValues-sized pieces.
  for (let at = 33; at < bytes.length; at += 65536) crypto.getRandomValues(bytes.subarray(at, Math.min(bytes.length, at + 65536)));
  bytes[32] = seed & 0xff;
  return bytes;
}

async function image(seed: number, name: string, padding = 256): Promise<{ entry: LibraryImage; bytes: Uint8Array<ArrayBuffer> }> {
  const bytes = png(64 + seed, 32, padding, seed);
  return { bytes, entry: { id: await sha256Hex(bytes), mime: "image/png", width: 64 + seed, height: 32, byteLength: bytes.length, name, importedAt: "2026-10-26T12:00:00.000Z" } };
}

/** Two arenas sharing one image, plus an unused image that must still be backed up. */
async function snapshot(): Promise<BackupSnapshot> {
  const { workspace } = firstWorkspace();
  const save = workspace.saves[0];
  const shared = await image(1, "Shared logo"), unused = await image(2, "Unused banner");
  for (const id of ["first_arena", "second_arena"]) {
    const arena = draftToJson(cloneArena(arenaById("raw")!, id, id));
    arena.ringTextures = { ...arena.ringTextures, mat_canvas: userImageRef(shared.entry.id) };
    save.arenas.push(arena);
  }
  save.images = [shared.entry, unused.entry];
  const images = new Map([shared, unused].map(({ entry, bytes }) => [entry.id, new Blob([bytes], { type: entry.mime })]));
  return { save, settings: workspace.settings, settingsRevision: 0, images };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately malformed data needs untyped access
async function alter(change: (zip: JSZip, manifest: Record<string, any>) => void | Promise<void>) {
  const zip = await JSZip.loadAsync(await encodeBackup(await snapshot()));
  const manifest = JSON.parse(await zip.file("save.json")!.async("string"));
  await change(zip, manifest);
  zip.file("save.json", JSON.stringify(manifest), { createFolders: false });
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately malformed data needs untyped access
const imageEntry = (manifest: Record<string, any>) => manifest.entries.find((entry: { path: string }) => entry.path.startsWith("assets/images/"));

describe("backups with imported images", () => {
  it("round-trips shared and unused images byte for byte", async () => {
    const source = await snapshot();
    const restored = await decodeBackup(await encodeBackup(source));
    expect(restored.snapshot.save).toEqual(source.save);
    expect(restored.manifest.formatVersion).toBe(2);
    for (const entry of source.save.images) {
      expect(new Uint8Array(await restored.snapshot.images.get(entry.id)!.arrayBuffer())).toEqual(new Uint8Array(await source.images.get(entry.id)!.arrayBuffer()));
    }
    const paths = restored.manifest.entries.map((entry) => entry.path);
    expect(paths).toContain("data/images/library.json");
    expect(paths.filter((path) => path.startsWith("assets/images/"))).toHaveLength(2);
  });

  it("stores image entries uncompressed", async () => {
    const bytes = await encodeBackup(await snapshot());
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    const methods = new Map<string, number>();
    for (let at = 0; at + 46 < bytes.length; at++) if (view.getUint32(at, true) === 0x02014b50) {
      const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + view.getUint16(at + 28, true)));
      methods.set(name, view.getUint16(at + 10, true));
    }
    for (const [name, method] of methods) expect(method).toBe(name.startsWith("assets/images/") ? 0 : 8);
  });

  it("still restores version 1 backups, with an empty library", async () => {
    const { workspace } = firstWorkspace();
    const arena = draftToJson(cloneArena(arenaById("raw")!, "old_arena", "Old Arena"));
    const zip = new JSZip();
    const files: [string, string, unknown][] = [
      ["data/settings/controls.json", "controls", workspace.settings.controls],
      ["data/settings/audio.json", "audio", workspace.settings.audio],
      ["data/settings/preferences.json", "preferences", workspace.settings.preferences],
      ["data/environments/arenas/old_arena.json", "arenas", arena],
    ];
    const entries = files.map(([path, component, value]) => {
      const bytes = new TextEncoder().encode(JSON.stringify(value));
      zip.file(path, bytes, { createFolders: false });
      return { path, component, schemaVersion: 1, byteLength: bytes.length };
    });
    const { id, name, createdAt, updatedAt, revision } = workspace.saves[0];
    zip.file("save.json", JSON.stringify({
      format: "virtual-pro-grappler", formatVersion: 1, gameVersion: "0.1.0", save: { id, name, createdAt, updatedAt, revision },
      exportedAt: createdAt, settingsRevision: 0, components: { controls: 1, audio: 1, preferences: 1, arenas: 1, drafts: 1 }, entries,
    }), { createFolders: false });
    const restored = await decodeBackup(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
    expect(restored.snapshot.save.images).toEqual([]);
    expect(restored.snapshot.save.arenas.map((entry) => entry.id)).toEqual(["old_arena"]);
    expect(restored.snapshot.images.size).toBe(0);
  });

  it("rejects bytes that do not match their content name", async () => {
    const bytes = await alter(async (zip, manifest) => {
      const entry = imageEntry(manifest);
      const data = await zip.file(entry.path)!.async("uint8array");
      data[40] ^= 1;
      zip.file(entry.path, data, { createFolders: false, compression: "STORE" });
    });
    await expect(decodeBackup(bytes)).rejects.toThrow("recorded hash");
  });

  it("rejects an inventory whose format or size disagrees with the bytes", async () => {
    await expect(decodeBackup(await alter((_zip, manifest) => { imageEntry(manifest).width += 1; }))).rejects.toThrow("format or size");
    await expect(decodeBackup(await alter(async (zip, manifest) => {
      const entry = imageEntry(manifest);
      const data = await zip.file(entry.path)!.async("uint8array");
      zip.remove(entry.path);
      entry.mime = "image/jpeg"; entry.path = entry.path.replace(/png$/, "jpg");
      zip.file(entry.path, data, { createFolders: false, compression: "STORE" });
    }))).rejects.toThrow("format or size");
  });

  it("rejects a library that disagrees with the image files", async () => {
    const edit = (change: (library: LibraryImage[]) => void) => alter(async (zip, manifest) => {
      const path = "data/images/library.json";
      const library = JSON.parse(await zip.file(path)!.async("string")) as LibraryImage[];
      change(library);
      const json = JSON.stringify(library);
      zip.file(path, json, { createFolders: false });
      manifest.entries.find((entry: { path: string }) => entry.path === path).byteLength = new TextEncoder().encode(json).length;
    });
    await expect(decodeBackup(await edit((library) => { library.pop(); }))).rejects.toThrow("library and files differ");
    await expect(decodeBackup(await edit((library) => { library[1].byteLength += 1; }))).rejects.toThrow("library and files differ");
    await expect(decodeBackup(await edit((library) => { library.splice(0, 1); }))).rejects.toThrow("not in this save");
  });

  it("rejects unlisted, misnamed and oversized image entries", async () => {
    await expect(decodeBackup(await alter((zip) => { zip.file(`assets/images/${"b".repeat(64)}.png`, png(2, 2, 8, 9), { createFolders: false }); }))).rejects.toThrow("Unexpected");
    await expect(decodeBackup(await alter((zip) => { zip.file("assets/images/logo.png", png(2, 2, 8, 9), { createFolders: false }); }))).rejects.toThrow("Unsafe");
    await expect(decodeBackup(await alter((zip) => { zip.file(`assets/images/${"c".repeat(64)}.png`, new Uint8Array(LIMITS.imageBytes + 1), { createFolders: false }); }))).rejects.toThrow("oversized");
    await expect(decodeBackup(await alter((_zip, manifest) => { manifest.entries = manifest.entries.filter((entry: { path: string }) => entry.path !== "data/images/library.json"); }))).rejects.toThrow();
  });

  it("round-trips a near-limit 64 MiB library within the archive limit", async () => {
    const { workspace } = firstWorkspace();
    const save = workspace.saves[0];
    const images = new Map<string, Blob>();
    // Sixteen incompressible images just under 4 MiB: the most bytes a save may hold.
    for (let i = 0; i < 16; i++) {
      const { entry, bytes } = await image(i, `Large ${i}`, LIMITS.imageBytes - 64);
      save.images.push(entry);
      images.set(entry.id, new Blob([bytes], { type: entry.mime }));
    }
    const total = save.images.reduce((sum, entry) => sum + entry.byteLength, 0);
    expect(total).toBeLessThanOrEqual(LIMITS.libraryBytes);
    const before = process.memoryUsage();
    let started = performance.now();
    const bytes = await encodeBackup({ save, settings: workspace.settings, settingsRevision: 0, images });
    const encodeMs = performance.now() - started;
    expect(bytes.length).toBeLessThanOrEqual(LIMITS.archiveBytes);
    started = performance.now();
    const restored = await decodeBackup(bytes);
    const decodeMs = performance.now() - started;
    const after = process.memoryUsage();
    expect(restored.snapshot.save.images).toHaveLength(16);
    process.stderr.write(`near-limit backup: ${(bytes.length / 1048576).toFixed(1)} MiB archive, encode ${encodeMs.toFixed(0)} ms, decode ${decodeMs.toFixed(0)} ms, ` +
      `Node RSS +${((after.rss - before.rss) / 1048576).toFixed(0)} MiB, array buffers +${((after.arrayBuffers - before.arrayBuffers) / 1048576).toFixed(0)} MiB\n`);
  }, 120_000);
});
