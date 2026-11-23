import JSZip from "jszip";
import packageInfo from "../../../package.json";
import { COMPONENTS, FORMAT_VERSION, LIMITS, copy, type BackupImageEntry, type BackupManifest, type BackupSnapshot, type Component, type ImageInfo, type LibraryImage } from "./types";
import { validateManifest, validateManifestV1, validateSave, validateSettings } from "./validation";
import { sha256Hex, sniffImage } from "./images";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

const LIBRARY_PATH = "data/images/library.json";
const EXTENSIONS = { "image/png": "png", "image/jpeg": "jpg" } as const;
const JSON_NAME = /^[a-zA-Z0-9_./-]+\.json$/;
const IMAGE_NAME = /^assets\/images\/[a-f0-9]{64}\.(png|jpg)$/;

function imagePath(image: ImageInfo): string { return `assets/images/${image.id}.${EXTENSIONS[image.mime]}`; }

export async function encodeBackup(snapshot: BackupSnapshot): Promise<Uint8Array> {
  validateSave(snapshot.save);
  validateSettings(snapshot.settings);
  const zip = new JSZip();
  const entries: BackupManifest["entries"] = [];
  let total = 0;
  const add = (path: string, component: Component, value: unknown) => {
    const bytes = encoder.encode(JSON.stringify(value));
    total += bytes.byteLength;
    if (bytes.byteLength > LIMITS.entryBytes || total > LIMITS.jsonBytes) throw new Error("Save exceeds backup size limits.");
    entries.push({ path, component, schemaVersion: 1, byteLength: bytes.byteLength });
    zip.file(path, bytes, { createFolders: false });
  };
  add("data/settings/controls.json", "controls", snapshot.settings.controls);
  add("data/settings/audio.json", "audio", snapshot.settings.audio);
  add("data/settings/preferences.json", "preferences", snapshot.settings.preferences);
  for (const arena of snapshot.save.arenas) add(`data/environments/arenas/${arena.id}.json`, "arenas", arena);
  for (const draft of snapshot.save.drafts) add(`drafts/arenas/${draft.id}.json`, "drafts", draft);
  // The whole library goes, including images nothing uses yet.
  add(LIBRARY_PATH, "images", snapshot.save.images);
  for (const image of snapshot.save.images) {
    const blob = snapshot.images.get(image.id);
    if (!blob) throw new Error(`Imported image “${image.name}” has no bytes to back up.`);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    // Checked like restored bytes, so a damaged record is caught before a backup claims to hold it.
    if (bytes.length !== image.byteLength || await sha256Hex(bytes) !== image.id) throw new Error(`Imported image “${image.name}” is damaged in local storage.`);
    const { id, mime, width, height } = image;
    entries.push({ path: imagePath(image), component: "images", schemaVersion: 1, byteLength: bytes.length, id, mime, width, height });
    // PNG and JPEG are already compressed; deflating them again only costs time.
    zip.file(imagePath(image), bytes, { createFolders: false, compression: "STORE" });
  }
  const { id, name, createdAt, updatedAt, revision } = snapshot.save;
  const manifest: BackupManifest = {
    format: "virtual-pro-grappler", formatVersion: FORMAT_VERSION, gameVersion: packageInfo.version,
    save: { id, name, createdAt, updatedAt, revision }, exportedAt: new Date().toISOString(),
    settingsRevision: snapshot.settingsRevision, components: COMPONENTS, entries,
  };
  validateManifest(manifest);
  const manifestBytes = encoder.encode(JSON.stringify(manifest));
  if (manifestBytes.length > LIMITS.entryBytes || entries.length + 1 > LIMITS.entries) throw new Error("Save exceeds backup entry limits.");
  zip.file("save.json", manifestBytes, { createFolders: false });
  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  if (bytes.length > LIMITS.archiveBytes) throw new Error("Save exceeds backup archive limit.");
  return bytes;
}

interface ZipEntry { name: string; image: boolean; size: number; crc: number; start: number; end: number }
// JSZip documents internalStream but omits it from its bundled JSZipObject declarations.
interface EntryStream {
  on(event: "data", callback: (data: Uint8Array) => void): EntryStream;
  on(event: "error", callback: (error: Error) => void): EntryStream;
  on(event: "end", callback: () => void): EntryStream;
  pause(): EntryStream;
  resume(): EntryStream;
}

/** Inspect original central AND local names before JSZip normalizes/merges entries. */
function inspectZip(bytes: Uint8Array): ZipEntry[] {
  if (bytes.byteLength > LIMITS.archiveBytes || bytes.byteLength < 22) throw new Error("Backup archive is empty or exceeds 80 MiB.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (n: number) => view.getUint16(n, true);
  const u32 = (n: number) => view.getUint32(n, true);
  const need = (start: number, length: number) => { if (start < 0 || length < 0 || start + length > bytes.length) throw new Error("Truncated ZIP archive."); };
  let end = -1;
  for (let n = bytes.length - 22; n >= Math.max(0, bytes.length - 65557); n--) {
    if (u32(n) === 0x06054b50 && n + 22 + u16(n + 20) === bytes.length) { end = n; break; }
  }
  if (end < 0) throw new Error("Invalid ZIP footer.");
  const count = u16(end + 10);
  const centralSize = u32(end + 12);
  const centralStart = u32(end + 16);
  if (u16(end + 4) || u16(end + 6) || u16(end + 8) !== count || count < 1 || count > LIMITS.entries || centralStart + centralSize !== end) throw new Error("Unsupported ZIP layout or too many entries.");
  const names = new Set<string>();
  const entries: ZipEntry[] = [];
  let at = centralStart;
  let json = 0, images = 0;
  for (let index = 0; index < count; index++) {
    need(at, 46);
    if (u32(at) !== 0x02014b50) throw new Error("Invalid ZIP directory.");
    const flags = u16(at + 8), method = u16(at + 10);
    const compressed = u32(at + 20), size = u32(at + 24), crc = u32(at + 16);
    const nameLength = u16(at + 28), extraLength = u16(at + 30), commentLength = u16(at + 32);
    const start = u32(at + 42);
    need(at + 46, nameLength + extraLength + commentLength);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    // Only ASCII JSON files and content-named images; no directory records, encryption, ZIP64 or data descriptors.
    const image = IMAGE_NAME.test(name);
    if ((!image && !JSON_NAME.test(name)) || name.startsWith("/") || name.split("/").some((part) => !part || part === "." || part === "..") || names.has(name)) throw new Error("Unsafe or duplicate ZIP entry name.");
    names.add(name);
    if ((flags & ~0x800) !== 0 || ![0, 8].includes(method) || u16(at + 34) !== 0 || size > (image ? LIMITS.imageBytes : LIMITS.entryBytes) || (u32(at + 38) >>> 16 & 0xf000) === 0xa000) throw new Error("Unsupported or oversized ZIP entry.");
    if (image) images += size; else json += size;
    if (json > LIMITS.jsonBytes || images > LIMITS.libraryBytes || json + images > LIMITS.extractedBytes) throw new Error("Backup exceeds extracted size limit.");
    need(start, 30);
    const localNameLength = u16(start + 26), localExtraLength = u16(start + 28);
    need(start + 30, localNameLength + localExtraLength);
    const localName = decoder.decode(bytes.subarray(start + 30, start + 30 + localNameLength));
    const dataStart = start + 30 + localNameLength + localExtraLength;
    if (u32(start) !== 0x04034b50 || localName !== name || u16(start + 6) !== flags || u16(start + 8) !== method || u32(start + 14) !== crc || u32(start + 18) !== compressed || u32(start + 22) !== size || dataStart + compressed > centralStart) throw new Error("ZIP local entry differs from its directory.");
    entries.push({ name, image, size, crc, start, end: dataStart + compressed });
    at += 46 + nameLength + extraLength + commentLength;
  }
  if (at !== end) throw new Error("Unexpected ZIP directory data.");
  const ranges = [...entries].sort((a, b) => a.start - b.start);
  if (ranges[0].start !== 0 || ranges.some((entry, i) => entry.end !== (ranges[i + 1]?.start ?? centralStart))) throw new Error("Overlapping or unexpected ZIP entry data.");
  return entries;
}

// Byte-at-a-time table: image entries make tens of MiB worth checking on restore.
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let crc = n;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc;
});

function crc32(bytes: Uint8Array): number {
  let crc = -1;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

/** Bounded streaming extraction, including when the ZIP lies about uncompressed size. */
function extract(file: JSZip.JSZipObject, entry: ZipEntry): Promise<Uint8Array<ArrayBuffer>> {
  const limit = entry.image ? LIMITS.imageBytes : LIMITS.entryBytes;
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let length = 0;
    let failed = false;
    const stream = (file as unknown as { internalStream(type: "uint8array"): EntryStream }).internalStream("uint8array");
    stream.on("data", (chunk: Uint8Array) => {
      if (failed) return;
      length += chunk.length;
      if (length > entry.size || length > limit) {
        failed = true; stream.pause(); reject(new Error("ZIP entry exceeds its declared size.")); return;
      }
      chunks.push(chunk);
    }).on("error", (error) => { failed = true; reject(error); }).on("end", () => {
      if (failed) return;
      const data = new Uint8Array(length);
      let at = 0;
      for (const chunk of chunks) { data.set(chunk, at); at += chunk.length; }
      if (length !== entry.size || crc32(data) !== entry.crc) reject(new Error("Backup entry size/checksum mismatch."));
      else resolve(data);
    }).resume();
  });
}

/**
 * Version 1 predates imported images. Its manifest is validated against its
 * own frozen schema and then read as a current one with an empty library.
 */
function migrateManifest(value: unknown): BackupManifest {
  if ((value as { formatVersion?: unknown } | null)?.formatVersion === 1) {
    validateManifestV1(value);
    return { ...(value as BackupManifest), formatVersion: FORMAT_VERSION, components: COMPONENTS };
  }
  validateManifest(value);
  return value;
}

export async function decodeBackup(bytes: Uint8Array): Promise<{ snapshot: BackupSnapshot; manifest: BackupManifest }> {
  const directory = inspectZip(bytes);
  const zip = await JSZip.loadAsync(bytes, { createFolders: false, checkCRC32: false });
  const raw = async (name: string): Promise<Uint8Array<ArrayBuffer>> => {
    const entry = directory.find((entry) => entry.name === name);
    const file = zip.file(name);
    if (!entry || !file || file.unsafeOriginalName !== name) throw new Error(`Missing or renamed backup entry: ${name}`);
    return extract(file, entry);
  };
  const read = async (name: string): Promise<unknown> => JSON.parse(decoder.decode(await raw(name)));
  const original = await read("save.json");
  const legacy = (original as { formatVersion?: unknown } | null)?.formatVersion === 1;
  const manifest = migrateManifest(original);
  const expected = new Set(["save.json"]);
  for (const entry of manifest.entries) {
    if (expected.has(entry.path)) throw new Error("Duplicate backup inventory entry.");
    expected.add(entry.path);
    if (directory.find((file) => file.name === entry.path)?.size !== entry.byteLength) throw new Error("Backup inventory size differs from ZIP directory.");
  }
  if (directory.length !== expected.size || directory.some((entry) => !expected.has(entry.name))) throw new Error("Unexpected or missing backup files.");
  const records = new Map<string, unknown>();
  const inventory = new Map<string, BackupImageEntry>();
  const images = new Map<string, Blob>();
  for (const entry of manifest.entries) {
    if (!("id" in entry)) { records.set(entry.path, await read(entry.path)); continue; }
    // Bytes are checked against their content name before anything trusts them.
    const data = await raw(entry.path);
    if (entry.path !== imagePath(entry) || inventory.has(entry.id) || await sha256Hex(data) !== entry.id) throw new Error("Backup image does not match its recorded hash.");
    const header = sniffImage(data);
    if (header?.mime !== entry.mime || header.width !== entry.width || header.height !== entry.height) throw new Error("Backup image does not match its recorded format or size.");
    inventory.set(entry.id, entry);
    images.set(entry.id, new Blob([data], { type: entry.mime }));
  }
  const settings = {
    controls: records.get("data/settings/controls.json"), audio: records.get("data/settings/audio.json"),
    preferences: records.get("data/settings/preferences.json"),
  };
  validateSettings(settings);
  const save: BackupSnapshot["save"] = { ...copy(manifest.save), arenas: [], drafts: [], images: [] };
  if (!legacy && !records.has(LIBRARY_PATH)) throw new Error("Backup image library is missing.");
  for (const entry of manifest.entries) {
    if ("id" in entry) continue;
    const value = records.get(entry.path) as { id?: string };
    let correctPath: string;
    if (entry.component === "arenas") {
      correctPath = `data/environments/arenas/${value?.id}.json`;
      save.arenas.push(value as BackupSnapshot["save"]["arenas"][number]);
    } else if (entry.component === "drafts") {
      correctPath = `drafts/arenas/${value?.id}.json`;
      save.drafts.push(value as BackupSnapshot["save"]["drafts"][number]);
    } else if (entry.component === "images") {
      correctPath = LIBRARY_PATH;
      save.images = value as unknown as LibraryImage[];
    } else correctPath = `data/settings/${entry.component}.json`;
    if (correctPath !== entry.path) throw new Error("Backup component path/record id mismatch.");
  }
  validateSave(save);
  // The library and the image inventory must describe the same bytes, one for one.
  if (save.images.length !== inventory.size) throw new Error("Backup image library and files differ.");
  for (const image of save.images) {
    const entry = inventory.get(image.id);
    if (!entry || entry.mime !== image.mime || entry.width !== image.width || entry.height !== image.height || entry.byteLength !== image.byteLength) throw new Error("Backup image library and files differ.");
  }
  return { snapshot: { save, settings, settingsRevision: manifest.settingsRevision, images }, manifest };
}
