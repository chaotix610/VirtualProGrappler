import { afterEach, describe, expect, it } from "vitest";
import { IDBDatabase, IDBFactory } from "fake-indexeddb";
import { IndexedDbRepository, type SaveRepository } from "../../src/data/save/repository";
import { SaveCoordinator } from "../../src/data/save/coordinator";
import { firstWorkspace } from "../../src/data/save/migrations";
import { DATABASE_NAME } from "../../src/data/save/types";
import { LIMITS, copy, type ImageMime, type LibraryImage, type SaveRecord, type StoredImage, type Workspace } from "../../src/data/save/types";
import { validateArena, validateSave, validateWorkspace } from "../../src/data/save/validation";
import {
  fitWithin, imageUsage, libraryName, prepareImport, referencedImages, sha256Hex, sniffImage, userImageId, userImageRef, verifyDecodes,
  type DecodedImage, type ImageCodec, type PreparedImage,
} from "../../src/data/save/images";
import { arenaById } from "../../src/data/arenas";
import { cloneArena, draftToJson } from "../../src/data/arenaDraft";

/** A PNG signature and IHDR, followed by filler: enough for the header reader and the hash. */
function png(width: number, height: number, padding = 64, seed = 0): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(33 + padding);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13); view.setUint32(12, 0x49484452); view.setUint32(16, width); view.setUint32(20, height);
  for (let i = 33; i < bytes.length; i++) bytes[i] = (i * 31 + seed * 7) & 0xff;
  return bytes;
}

/** SOI, an optional EXIF APP1 segment before the frame header, SOF0 and EOI. */
function jpeg(width: number, height: number, exif = false): Uint8Array<ArrayBuffer> {
  const parts = [0xff, 0xd8];
  if (exif) parts.push(0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00);
  parts.push(0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9);
  return new Uint8Array(parts);
}

const blob = (bytes: Uint8Array<ArrayBuffer>, type = "") => new Blob([bytes], { type });

/** Decodes from the header and "encodes" a header of the requested size, sized by `sizeFor`. */
function codec(options: { sizeFor?: (width: number, height: number) => number; failDecode?: boolean; rotate?: boolean; lie?: boolean } = {}) {
  const encodes: { width: number; height: number; mime: ImageMime }[] = [];
  let closed = 0;
  const value: ImageCodec<DecodedImage> & { encodes: typeof encodes; closed(): number } = {
    encodes,
    closed: () => closed,
    async decode(source) {
      if (options.failDecode) throw new Error("decoder failure");
      const header = sniffImage(new Uint8Array(await source.arrayBuffer()));
      if (!header) throw new Error("undecodable");
      // A rotated photo arrives upright: its sides swap.
      const [width, height] = options.rotate ? [header.height, header.width] : [header.width, header.height];
      return { width, height, close: () => { closed++; } };
    },
    async encode(_image, width, height, mime) {
      encodes.push({ width, height, mime });
      const reported = options.lie ? width + 1 : width;
      const bytes = mime === "image/png" ? png(reported, height, options.sizeFor?.(width, height) ?? 64) : jpeg(reported, height);
      return blob(bytes, mime);
    },
  };
  return value;
}

async function prepared(seed: number, width = 64, height = 32, padding = 64): Promise<PreparedImage> {
  const bytes = png(width, height, padding, seed);
  return { info: { id: await sha256Hex(bytes), mime: "image/png", width, height, byteLength: bytes.length }, blob: blob(bytes, "image/png") };
}

const library = (image: PreparedImage, name = "Logo"): LibraryImage => ({ ...image.info, name, importedAt: "2026-10-26T12:00:00.000Z" });

function arenaUsing(id: string, imageId: string) {
  const arena = draftToJson(cloneArena(arenaById("raw")!, id, `Arena ${id}`));
  arena.ringTextures = { ...arena.ringTextures, mat_canvas: userImageRef(imageId) };
  return arena;
}

const coordinators: SaveCoordinator[] = [];
const repositories: SaveRepository[] = [];
afterEach(() => { coordinators.forEach((c) => c.dispose()); repositories.forEach((r) => r.close()); coordinators.length = 0; repositories.length = 0; });

function coordinator(factory = new IDBFactory(), options: { writer?: boolean; estimate?: StorageEstimate | null } = {}) {
  const c = new SaveCoordinator({
    openRepository: async () => { const r = await IndexedDbRepository.open({ factory }); repositories.push(r); return r; },
    acquireWriter: async () => options.writer === false ? null : { release() {} },
    legacyStorage: () => null,
    storageEstimate: async () => options.estimate ?? null,
    debounceMs: 60_000,
  });
  coordinators.push(c);
  return c;
}

async function storedImageIds(factory: IDBFactory): Promise<string[]> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const req = factory.open(DATABASE_NAME); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
  try {
    return await new Promise((resolve, reject) => { const req = db.transaction("images").objectStore("images").getAllKeys(); req.onsuccess = () => resolve(req.result as string[]); req.onerror = () => reject(req.error); });
  } finally { db.close(); }
}

describe("image headers, references and sizing", () => {
  it("reads PNG and JPEG sizes from bytes and rejects other formats", () => {
    expect(sniffImage(png(300, 200))).toEqual({ mime: "image/png", width: 300, height: 200 });
    expect(sniffImage(jpeg(640, 480, true))).toEqual({ mime: "image/jpeg", width: 640, height: 480 });
    const text = (value: string) => new TextEncoder().encode(value);
    for (const other of [text("GIF89a\x01\x00\x01\x00"), text("<svg xmlns='http://www.w3.org/2000/svg'/>"), text("RIFF\x00\x00\x00\x00WEBPVP8 "), png(1, 1).slice(0, 20), new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), png(0, 5)]) {
      expect(sniffImage(other)).toBeNull();
    }
  });

  it("fits within 2048 px per side and 4 MP without changing images already inside", () => {
    expect(fitWithin(4096, 1024)).toEqual({ width: 2048, height: 512 });
    expect(fitWithin(3000, 3000)).toEqual({ width: 2048, height: 2048 });
    expect(fitWithin(300, 200)).toEqual({ width: 300, height: 200 });
    expect(fitWithin(20000, 10)).toEqual({ width: 2048, height: 1 });
  });

  it("parses only well-formed references and finds them in texture maps", () => {
    const id = "a".repeat(64);
    expect(userImageId(userImageRef(id))).toBe(id);
    expect(userImageId("user-image:xyz")).toBeNull();
    expect(userImageId(`assets/${id}.png`)).toBeNull();
    expect([...referencedImages({ ringTextures: { mat_canvas: userImageRef(id), canvasColor: "#fff" }, arenaTextures: { mat_apron: "assets/a.png" } })]).toEqual([id]);
    expect(libraryName("  My  Logo.final.PNG ")).toBe("My Logo.final");
    expect(libraryName(".png")).toBe("Imported image");
  });
});

describe("import processing", () => {
  it("re-encodes in the source format, downscales oversized art and hashes the stored output", async () => {
    const fake = codec();
    const result = await prepareImport(blob(png(4096, 1024)), fake);
    expect(fake.encodes).toEqual([{ width: 2048, height: 512, mime: "image/png" }]);
    expect(result.info).toMatchObject({ mime: "image/png", width: 2048, height: 512 });
    const stored = new Uint8Array(await result.blob.arrayBuffer());
    expect(result.info.id).toBe(await sha256Hex(stored));
    expect(result.info.byteLength).toBe(stored.length);
    expect(result.blob.type).toBe("image/png");
    expect(fake.closed()).toBe(1);
    const photo = await prepareImport(blob(jpeg(800, 600, true)), codec());
    expect(photo.info).toMatchObject({ mime: "image/jpeg", width: 800, height: 600 });
  });

  it("uses the decoded (oriented) size rather than the stored header size", async () => {
    const result = await prepareImport(blob(jpeg(40, 20, true)), codec({ rotate: true }));
    expect(result.info).toMatchObject({ width: 20, height: 40 });
  });

  it("shrinks further when the encoded bytes exceed 4 MiB, and gives up after three passes", async () => {
    const shrinking = codec({ sizeFor: (w, h) => Math.floor(w * h * 1.5) });
    const result = await prepareImport(blob(png(2048, 2048)), shrinking);
    expect(shrinking.encodes.length).toBe(2);
    expect(result.info.byteLength).toBeLessThanOrEqual(LIMITS.imageBytes);
    expect(result.info.width).toBeLessThan(2048);
    const stuck = codec({ sizeFor: () => LIMITS.imageBytes + 1 });
    await expect(prepareImport(blob(png(64, 64)), stuck)).rejects.toThrow("still larger than 4 MiB");
    expect(stuck.encodes.length).toBe(4);
    expect(stuck.closed()).toBe(1);
  });

  it("refuses unsupported, oversized, undecodable or misencoded input before storing anything", async () => {
    const fake = codec();
    await expect(prepareImport(blob(new TextEncoder().encode("GIF89a....")), fake)).rejects.toThrow("Only PNG and JPEG");
    await expect(prepareImport(new Blob([new Uint8Array(LIMITS.importFileBytes + 1)]), fake)).rejects.toThrow("32 MiB");
    await expect(prepareImport(blob(png(10000, 6000)), fake)).rejects.toThrow("too large to process");
    await expect(prepareImport(blob(png(20000, 10)), fake)).rejects.toThrow("too large to process");
    expect(fake.encodes).toHaveLength(0);
    await expect(prepareImport(blob(png(10, 10)), codec({ failDecode: true }))).rejects.toThrow("could not be decoded");
    await expect(prepareImport(blob(png(10, 10)), codec({ lie: true }))).rejects.toThrow("unexpected image");
  });

  it("checks restored bytes by decoding them", async () => {
    const image = await prepared(1);
    await expect(verifyDecodes([library(image)], new Map([[image.info.id, image.blob]]), codec())).resolves.toBeUndefined();
    await expect(verifyDecodes([library(image)], new Map([[image.info.id, image.blob]]), codec({ rotate: true }))).rejects.toThrow("different size");
    await expect(verifyDecodes([library(image)], new Map(), codec())).rejects.toThrow("no bytes");
  });
});

describe("library validation", () => {
  it("accepts references to the save's own images and rejects any other", async () => {
    const image = await prepared(1);
    const arena = arenaUsing("logo_arena", image.info.id);
    expect(() => validateArena(arena, new Set([image.info.id]))).not.toThrow();
    // Bundled files and repository authoring have no library.
    expect(() => validateArena(arena)).toThrow("not in this save");
    expect(() => validateArena({ ...arena, previewImage: userImageRef(image.info.id) }, new Set([image.info.id]))).toThrow("only dress arena texture slots");
    expect(() => validateArena({ ...arena, ringTextures: { mat_canvas: "user-image:not-a-hash" } }, new Set([image.info.id]))).toThrow("not in this save");
  });

  it("enforces per-save counts and bytes and agreement between saves", async () => {
    const { workspace } = firstWorkspace();
    const save = workspace.saves[0];
    const image = await prepared(1);
    save.images = [library(image)];
    save.arenas = [arenaUsing("logo_arena", image.info.id)];
    expect(() => validateSave(save)).not.toThrow();
    expect(() => validateSave({ ...save, images: [] })).toThrow("not in this save");
    expect(() => validateSave({ ...save, images: [library(image), library(image, "Again")] })).toThrow("listed twice");
    const big = (i: number): LibraryImage => ({ ...library(image), id: i.toString(16).padStart(64, "0"), byteLength: LIMITS.imageBytes });
    expect(() => validateSave({ ...save, arenas: [], images: Array.from({ length: 17 }, (_, i) => big(i)) })).toThrow("64 MiB");
    expect(() => validateSave({ ...save, arenas: [], images: Array.from({ length: 65 }, (_, i) => ({ ...big(i), byteLength: 1 })) })).toThrow();
    const other: SaveRecord = { ...copy(save), id: crypto.randomUUID(), arenas: [], images: [{ ...library(image), width: 65 }] };
    expect(() => validateWorkspace({ ...workspace, saves: [save, other] })).toThrow("disagree");
  });

  it("lists what uses an image, including an unsaved draft", async () => {
    const image = await prepared(1);
    const { workspace } = firstWorkspace();
    const save = workspace.saves[0];
    save.images = [library(image)];
    save.arenas = [arenaUsing("logo_arena", image.info.id)];
    const draft = cloneArena(arenaById("raw")!, "draft_arena", "Draft");
    draft.arenaTextures.mat_ringside_barricade = userImageRef(image.info.id);
    save.drafts = [{ id: "editor", editingId: null, draft }];
    expect(imageUsage(save, image.info.id)).toEqual(["Arena logo_arena", "the unsaved editor draft"]);
  });
});

describe("image library storage", () => {
  it("keeps imported bytes across reloads and shares one record between saves", async () => {
    const factory = new IDBFactory();
    const c = coordinator(factory); await c.start();
    const image = await prepared(1);
    const first = await c.importImage(image, "Logo");
    expect(first.duplicate).toBe(false);
    expect((await c.importImage(image, "Logo again")).duplicate).toBe(true);
    expect(c.activeSave.images.map((entry) => entry.name)).toEqual(["Logo"]);
    await c.createSave("Second");
    await c.importImage(image, "Shared logo");
    expect(await storedImageIds(factory)).toEqual([image.info.id]);
    c.dispose();
    const reload = coordinator(factory); await reload.start();
    // Saves reload in key order, so compare without relying on it.
    expect(reload.workspace.value!.saves.map((save) => save.images.map((entry) => entry.name)).sort()).toEqual([["Logo"], ["Shared logo"]]);
    const bytes = (await reload.readImages([image.info.id])).get(image.info.id)!;
    expect(new Uint8Array(await bytes.arrayBuffer())).toEqual(new Uint8Array(await image.blob.arrayBuffer()));
  });

  it("blocks deletion while an arena or pending draft uses an image, and removes bytes once no save lists them", async () => {
    const factory = new IDBFactory();
    const c = coordinator(factory); await c.start();
    const image = await prepared(1);
    await c.importImage(image, "Logo");
    const original = c.activeSave.id;
    await c.putArena(arenaUsing("logo_arena", image.info.id));
    await expect(c.deleteImage(image.info.id)).rejects.toThrow("used by Arena logo_arena");
    expect(c.status.error).toBe("");
    await c.deleteArena("logo_arena");
    const draft = cloneArena(arenaById("raw")!, "draft_arena", "Draft");
    draft.ringTextures.mat_apron = userImageRef(image.info.id);
    c.draftChanged(original, { id: "editor", editingId: null, draft });
    await expect(c.deleteImage(image.info.id)).rejects.toThrow("unsaved editor draft");
    c.draftChanged(original, null);
    await c.createSave("Second"); await c.importImage(image, "Shared");
    await c.switchSave(original);
    await c.deleteImage(image.info.id);
    expect(c.activeSave.images).toEqual([]);
    expect(await storedImageIds(factory)).toEqual([image.info.id]);
    const second = c.workspace.value!.saves.find((save) => save.name === "Second")!.id;
    await c.deleteSave(second);
    expect(await storedImageIds(factory)).toEqual([]);
  });

  it("refuses an import the reported quota cannot hold and leaves the library unchanged", async () => {
    const factory = new IDBFactory();
    const c = coordinator(factory, { estimate: { quota: 1024 * 1024, usage: 512 * 1024 } }); await c.start();
    await expect(c.importImage(await prepared(1), "Logo")).rejects.toThrow("Not enough browser storage");
    expect(c.activeSave.images).toEqual([]);
    expect(await storedImageIds(factory)).toEqual([]);
    expect(c.status.error).toBe("");
  });

  it("keeps the library and stored bytes unchanged when the transaction fails", async () => {
    const factory = new IDBFactory();
    const c = coordinator(factory); await c.start();
    const real = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (this: IDBDatabase, ...args: Parameters<typeof real>) {
      const tx = real.apply(this, args);
      if (args[1] === "readwrite") queueMicrotask(() => tx.abort());
      return tx;
    };
    try { await expect(c.importImage(await prepared(1), "Logo")).rejects.toThrow("aborted"); }
    finally { IDBDatabase.prototype.transaction = real; }
    expect(c.activeSave.images).toEqual([]);
    expect(await storedImageIds(factory)).toEqual([]);
  });

  it("refuses a 65th image and a prepared image whose bytes disagree with its record", async () => {
    const c = coordinator(); await c.start();
    for (let i = 0; i < LIMITS.images; i++) await c.importImage(await prepared(i, 8, 8, 4), `Image ${i}`);
    await expect(c.importImage(await prepared(999, 8, 8, 4), "One more")).rejects.toThrow(`${LIMITS.images} imported images`);
    const wrong = await prepared(1000);
    await expect(c.importImage({ ...wrong, info: { ...wrong.info, byteLength: 5 } }, "Wrong")).rejects.toThrow("recorded size");
  });

  it("imports into the save selected when the import began, even if a switch is queued", async () => {
    const c = coordinator(); await c.start();
    const original = c.activeSave.id;
    await c.createSave("Other"); const other = c.activeSave.id;
    await c.switchSave(original);
    const importing = c.importImage(await prepared(1), "Logo");
    const switching = c.switchSave(other);
    await Promise.all([importing, switching]);
    expect(c.workspace.value!.saves.find((save) => save.id === original)!.images).toHaveLength(1);
    expect(c.activeSave.id).toBe(other); expect(c.activeSave.images).toHaveLength(0);
  });

  it("holds bytes in memory for a temporary session and still exports them", async () => {
    const factory = new IDBFactory();
    const c = coordinator(factory, { writer: false }); await c.start();
    const image = await prepared(1);
    await c.importImage(image, "Logo");
    expect(c.status.mode).toBe("temporary");
    expect(await storedImageIds(factory)).toEqual([]);
    const snapshot = await c.snapshot();
    expect([...snapshot.images.keys()]).toEqual([image.info.id]);
    await c.deleteImage(image.info.id);
    await expect(c.readImages([image.info.id])).rejects.toThrow();
  });

  it("restores a backup's images atomically and dedupes bytes already stored", async () => {
    const factory = new IDBFactory();
    const c = coordinator(factory); await c.start();
    const image = await prepared(1);
    await c.importImage(image, "Logo");
    await c.putArena(arenaUsing("logo_arena", image.info.id));
    const snapshot = await c.snapshot();
    await c.restore(snapshot, { replace: false, settings: false, exportedAt: snapshot.save.updatedAt });
    expect(c.activeSave.images.map((entry) => entry.name)).toEqual(["Logo"]);
    expect(c.activeSave.arenas[0].ringTextures!.mat_canvas).toBe(userImageRef(image.info.id));
    expect(await storedImageIds(factory)).toEqual([image.info.id]);
    await expect(c.restore({ ...snapshot, images: new Map() }, { replace: false, settings: false, exportedAt: snapshot.save.updatedAt })).rejects.toThrow("missing or incomplete");
    expect(c.workspace.value!.saves).toHaveLength(2);
  });
});

describe("database upgrade from version 1", () => {
  it("adds the image store and an empty library to every existing save without losing records", async () => {
    const factory = new IDBFactory();
    const { workspace } = firstWorkspace();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately malformed data needs untyped access
    const legacy = copy(workspace) as unknown as Record<string, any>;
    legacy.schemaVersion = 1;
    for (const save of legacy.saves) delete save.images;
    legacy.saves[0].arenas = [draftToJson(cloneArena(arenaById("raw")!, "kept_arena", "Kept Arena"))];
    const v1 = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = factory.open(DATABASE_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore("metadata"); req.result.createObjectStore("saves", { keyPath: "id" }); };
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
    const { saves, ...metadata } = legacy;
    await new Promise<void>((resolve, reject) => {
      const tx = v1.transaction(["metadata", "saves"], "readwrite");
      tx.objectStore("metadata").put(metadata, "workspace");
      for (const save of saves) tx.objectStore("saves").put(save);
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
    });
    v1.close();
    const repository = await IndexedDbRepository.open({ factory }); repositories.push(repository);
    const loaded = (await repository.load()) as Workspace;
    expect(loaded.schemaVersion).toBe(2);
    expect(loaded.saves[0].images).toEqual([]);
    expect(loaded.saves[0].arenas.map((arena) => arena.id)).toEqual(["kept_arena"]);
    const image = await prepared(1);
    const next = copy(loaded); next.revision++;
    next.saves[0].images = [library(image)];
    await repository.commit(next, loaded.revision, [{ ...image.info, blob: image.blob } satisfies StoredImage]);
    expect(await storedImageIds(factory)).toEqual([image.info.id]);
  });

  it("rejects a version 1 workspace that does not match its frozen schema", async () => {
    const { migrateWorkspace } = await import("../../src/data/save/migrations");
    const { workspace } = firstWorkspace();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately malformed data needs untyped access
    const legacy = copy(workspace) as unknown as Record<string, any>;
    legacy.schemaVersion = 1;
    // A v1 save could not have held a library.
    expect(() => migrateWorkspace(legacy)).toThrow("v1");
    expect(() => migrateWorkspace({ ...legacy, schemaVersion: 3 })).toThrow("Unsupported");
  });
});
