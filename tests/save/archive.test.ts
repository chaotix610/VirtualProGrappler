import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { encodeBackup, decodeBackup } from "../../src/data/save/archive";
import { firstWorkspace } from "../../src/data/save/migrations";
import { LIMITS, type BackupSnapshot } from "../../src/data/save/types";
import { arenaById } from "../../src/data/arenas";
import { cloneArena, draftToJson } from "../../src/data/arenaDraft";

function snapshot(): BackupSnapshot {
  const { workspace } = firstWorkspace();
  const draft = cloneArena(arenaById("raw")!, "my_arena", "My Arena");
  workspace.saves[0].arenas.push(draftToJson(draft));
  workspace.saves[0].drafts.push({ id: "editor", editingId: "my_arena", draft });
  return { save: workspace.saves[0], settings: workspace.settings, settingsRevision: 0, images: new Map() };
}

async function alter(change: (zip: JSZip, manifest: Record<string, any>) => void | Promise<void>) {
  const zip = await JSZip.loadAsync(await encodeBackup(snapshot()));
  const manifest = JSON.parse(await zip.file("save.json")!.async("string"));
  await change(zip, manifest);
  zip.file("save.json", JSON.stringify(manifest), { createFolders: false });
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

describe("portable .vpg backups", () => {
  it("round-trips settings, a custom arena and its recovery draft without bundled assets", async () => {
    const source = snapshot();
    const bytes = await encodeBackup(source);
    const restored = await decodeBackup(bytes);
    expect(restored.snapshot).toEqual(source);
    expect(restored.manifest.gameVersion).toBe("0.1.0");
    expect(restored.manifest.entries.some((entry) => entry.path.startsWith("assets/"))).toBe(false);
    expect(bytes.length).toBeLessThan(10_000);
  });

  it.each(["formatVersion", "components"])("rejects unsupported %s before application", async (field) => {
    const bytes = await alter((_zip, manifest) => {
      if (field === "formatVersion") manifest.formatVersion = 3;
      else manifest.components.wrestlers = 1;
    });
    await expect(decodeBackup(bytes)).rejects.toThrow("manifest");
  });

  it("rejects missing entries and unlisted future records", async () => {
    await expect(decodeBackup(await alter((zip) => { zip.remove("data/settings/audio.json"); }))).rejects.toThrow();
    await expect(decodeBackup(await alter((zip) => { zip.file("state/progress.json", "{}", { createFolders: false }); }))).rejects.toThrow("Unexpected");
  });

  it("rejects inventory duplicates and mismatched record filenames", async () => {
    await expect(decodeBackup(await alter((_zip, manifest) => { manifest.entries.push(manifest.entries[0]); }))).rejects.toThrow("Duplicate");
    const bytes = await alter(async (zip, manifest) => {
      const path = "data/environments/arenas/my_arena.json";
      const arena = JSON.parse(await zip.file(path)!.async("string")); arena.id = "different_id";
      const json = JSON.stringify(arena); zip.file(path, json, { createFolders: false });
      manifest.entries.find((entry: { path: string }) => entry.path === path).byteLength = new TextEncoder().encode(json).length;
    });
    await expect(decodeBackup(bytes)).rejects.toThrow("mismatch");
  });

  it("rejects traversal and normalized aliases before JSZip sanitizes them", async () => {
    const bytes = await alter((zip) => { zip.file("data/../save.json", "{}", { createFolders: false }); });
    await expect(decodeBackup(bytes)).rejects.toThrow("Unsafe");
  });

  it("rejects duplicate original names even when JSZip would merge them", async () => {
    const bytes = await alter((zip) => { zip.file("fake.json", "{}", { createFolders: false }); });
    // Same-length original names in both headers: fake.json -> save.json.
    const needle = new TextEncoder().encode("fake.json");
    const replace = new TextEncoder().encode("save.json");
    for (let at = 0; at < bytes.length - needle.length; at++) {
      if (needle.every((value, i) => bytes[at + i] === value)) bytes.set(replace, at);
    }
    await expect(decodeBackup(bytes)).rejects.toThrow("duplicate");
  });

  it("rejects local/central name disagreement and checksum corruption", async () => {
    const bytes = await encodeBackup(snapshot());
    const mismatch = bytes.slice(); mismatch[30] = 120;
    await expect(decodeBackup(mismatch)).rejects.toThrow("differs");
    const broken = bytes.slice();
    const view = new DataView(broken.buffer);
    const content = 30 + view.getUint16(26, true) + view.getUint16(28, true);
    broken[content + 3] ^= 1;
    await expect(decodeBackup(broken)).rejects.toThrow();
  });

  it("rejects an oversized entry before decompression and an oversized archive before parsing", async () => {
    const bytes = await alter((zip) => { zip.file("huge.json", "x".repeat(LIMITS.entryBytes + 1), { createFolders: false }); });
    expect(bytes.length).toBeLessThan(10_000);
    await expect(decodeBackup(bytes)).rejects.toThrow("oversized");
    await expect(decodeBackup(new Uint8Array(LIMITS.archiveBytes + 1))).rejects.toThrow("80 MiB");
  });

  it("bounds actual extraction when an attacker lies about the entry size", async () => {
    const zip = new JSZip(); zip.file("save.json", "x".repeat(1024 * 1024));
    const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    const view = new DataView(bytes.buffer);
    for (let at = 0; at < bytes.length - 46; at++) if (view.getUint32(at, true) === 0x02014b50) {
      const length = view.getUint16(at + 28, true);
      const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + length));
      if (name === "save.json") {
        view.setUint32(at + 24, 1, true);
        view.setUint32(view.getUint32(at + 42, true) + 22, 1, true);
      }
    }
    await expect(decodeBackup(bytes)).rejects.toThrow(/size|length/);
  });

  it("round-trips a bounded image-free save near the total extracted limit", async () => {
    const large = snapshot(); large.save.drafts = [];
    large.save.arenas = Array.from({ length: 100 }, (_, i) => ({ ...large.save.arenas[0], id: `arena_${i}`, $schema: "x".repeat(60_000) }));
    const bytes = await encodeBackup(large);
    const restored = await decodeBackup(bytes);
    expect(restored.snapshot.save.arenas).toHaveLength(100);
    expect(JSON.stringify(restored.snapshot).length).toBeGreaterThan(6_000_000);
  });

  it("rejects stage incompatibility and invalid control conflicts on restore", async () => {
    const bad = snapshot(); bad.save.arenas[0].floor = "assets/missing.glb";
    await expect(encodeBackup(bad)).rejects.toThrow("does not fit");
    const settings = snapshot(); settings.settings.controls.bindings.a = ["ArrowUp"];
    await expect(encodeBackup(settings)).rejects.toThrow("more than once");
  });
});
