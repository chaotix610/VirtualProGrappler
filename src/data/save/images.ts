import { LIMITS, type ImageInfo, type ImageMime, type LibraryImage, type SaveRecord } from "./types";

/**
 * Imported texture images: how arenas refer to them, what an import accepts
 * and how its bytes are prepared. Decoding and encoding go through an
 * injected codec, so everything here runs without a DOM.
 */

const PREFIX = "user-image:";
const REFERENCE = /^user-image:([a-f0-9]{64})$/;

/** How a texture slot names an imported image. Bundled textures keep their repository paths. */
export function userImageRef(id: string): string { return `${PREFIX}${id}`; }

/** Anything with the prefix is meant as an imported image, so a malformed one is rejected rather than read as a path. */
export function isUserImageRef(value: string): boolean { return value.startsWith(PREFIX); }

export function userImageId(value: string): string | null { return REFERENCE.exec(value)?.[1] ?? null; }

type Textured = { arenaTextures?: Record<string, string>; ringTextures?: Record<string, string> };

/** Every imported image the texture maps name. */
export function referencedImages(source: Textured): Set<string> {
  const ids = new Set<string>();
  for (const map of [source.arenaTextures, source.ringTextures]) {
    for (const value of Object.values(map ?? {})) {
      const id = typeof value === "string" ? userImageId(value) : null;
      if (id) ids.add(id);
    }
  }
  return ids;
}

/** What in a save uses an image, by the names the player sees. Empty means it can be deleted. */
export function imageUsage(save: SaveRecord, id: string): string[] {
  const uses = save.arenas.filter((arena) => referencedImages(arena).has(id)).map((arena) => arena.displayName);
  if (save.drafts.some((recovery) => referencedImages(recovery.draft).has(id))) uses.push("the unsaved editor draft");
  return uses;
}

export interface ImageHeader { mime: ImageMime; width: number; height: number }

/**
 * The format and stored dimensions, read from the bytes. File extensions and
 * reported MIME types are only hints, so they are never consulted.
 */
export function sniffImage(bytes: Uint8Array): ImageHeader | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 24 && png.every((value, i) => bytes[i] === value)) {
    // The first chunk must be a 13-byte IHDR.
    if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) return null;
    const width = view.getUint32(16), height = view.getUint32(20);
    return width && height ? { mime: "image/png", width, height } : null;
  }
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    if (marker === 0xff) { at++; continue; }
    // Standalone markers carry no length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { at += 2; continue; }
    // Image data or the end before any frame header: nothing to size.
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = view.getUint16(at + 2);
    if (length < 2) return null;
    const frame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (frame) {
      if (at + 9 > bytes.length) return null;
      const height = view.getUint16(at + 5), width = view.getUint16(at + 7);
      return width && height ? { mime: "image/jpeg", width, height } : null;
    }
    at += 2 + length;
  }
  return null;
}

/** The largest size within the stored-image limits, keeping the aspect ratio. */
export function fitWithin(width: number, height: number, maxSide: number = LIMITS.imageSide, maxPixels: number = LIMITS.imagePixels): { width: number; height: number } {
  const scale = Math.min(1, maxSide / width, maxSide / height, Math.sqrt(maxPixels / (width * height)));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice().buffer));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface DecodedImage { width: number; height: number; close(): void }

export interface ImageCodec<T extends DecodedImage = DecodedImage> {
  /** Decodes with the file's own orientation applied, so a rotated photo arrives upright. */
  decode(blob: Blob): Promise<T>;
  /** Draws the decoded image at this size and encodes it fresh, which carries no metadata over. */
  encode(image: T, width: number, height: number, mime: ImageMime): Promise<Blob>;
}

export interface PreparedImage { info: ImageInfo; blob: Blob }

/** Further shrink passes allowed when an encoded image is still over its byte limit. */
const SHRINK_ATTEMPTS = 3;

/**
 * Turns a chosen file into the bytes a save stores.
 *
 * Every import is decoded and re-encoded: PNG stays PNG, JPEG stays JPEG. That
 * applies orientation, drops metadata such as a phone's GPS position, and
 * shrinks anything over the side, pixel or byte limit rather than refusing it.
 * The id is the hash of the stored output, not of the original file.
 */
export async function prepareImport<T extends DecodedImage>(file: Blob, codec: ImageCodec<T>): Promise<PreparedImage> {
  if (file.size > LIMITS.importFileBytes) throw new Error("Images larger than 32 MiB cannot be imported.");
  const header = sniffImage(new Uint8Array(await file.arrayBuffer()));
  if (!header) throw new Error("Only PNG and JPEG images can be imported.");
  if (Math.max(header.width, header.height) > LIMITS.importSide || header.width * header.height > LIMITS.importPixels) {
    throw new Error("This image is too large to process. Use one under 16384 px per side and 50 megapixels.");
  }
  let decoded: T;
  try { decoded = await codec.decode(file); }
  catch { throw new Error("The image could not be decoded."); }
  try {
    let target = fitWithin(decoded.width, decoded.height);
    for (let attempt = 0; ; attempt++) {
      const encoded = await codec.encode(decoded, target.width, target.height, header.mime);
      if (encoded.size <= LIMITS.imageBytes) {
        const bytes = new Uint8Array(await encoded.arrayBuffer());
        const stored = sniffImage(bytes);
        if (stored?.mime !== header.mime || stored.width !== target.width || stored.height !== target.height) {
          throw new Error("The browser produced an unexpected image while processing the import.");
        }
        const info: ImageInfo = { id: await sha256Hex(bytes), mime: header.mime, width: target.width, height: target.height, byteLength: bytes.length };
        return { info, blob: new Blob([encoded], { type: header.mime }) };
      }
      if (attempt === SHRINK_ATTEMPTS) throw new Error("The processed image is still larger than 4 MiB. Use a smaller or simpler image.");
      const scale = Math.sqrt(LIMITS.imageBytes / encoded.size) * 0.9;
      target = { width: Math.max(1, Math.floor(target.width * scale)), height: Math.max(1, Math.floor(target.height * scale)) };
    }
  } finally { decoded.close(); }
}

/** Restored bytes must actually decode to the size their records claim, not merely carry a plausible header. */
export async function verifyDecodes<T extends DecodedImage>(library: readonly LibraryImage[], images: ReadonlyMap<string, Blob>, codec: ImageCodec<T>): Promise<void> {
  for (const image of library) {
    const blob = images.get(image.id);
    if (!blob) throw new Error(`Imported image “${image.name}” has no bytes.`);
    let decoded: T;
    try { decoded = await codec.decode(blob); }
    catch { throw new Error(`Imported image “${image.name}” could not be decoded.`); }
    const { width, height } = decoded;
    decoded.close();
    if (width !== image.width || height !== image.height) throw new Error(`Imported image “${image.name}” decodes to a different size than recorded.`);
  }
}

/** A library name from the chosen file's name. */
export function libraryName(fileName: string): string {
  const name = fileName.replace(/\.[^.]*$/, "").replace(/\s+/g, " ").trim().slice(0, 80).trim();
  return name || "Imported image";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KiB`;
  return `${(bytes / 1048576).toFixed(1)} MiB`;
}

export function describeImage(image: ImageInfo): string {
  return `${image.width}×${image.height} ${image.mime === "image/png" ? "PNG" : "JPEG"}, ${formatBytes(image.byteLength)}`;
}
