import type { ArenaData } from "../arenas";
import type { ArenaDraft } from "../arenaDraft";
import type { ControlMapping } from "../controls";
import type { AudioSettings } from "../../audio/menuAudio";

// Database upgrades, component schemas and portable formats evolve separately.
export const DATABASE_VERSION = 2;

/**
 * The IndexedDB database, and the stem of the Web Lock that guards it.
 *
 * Not V2's `vpg-player-data`: that project was served from the same localhost
 * origin during testing, so its database may already sit in the browser, full
 * of arenas that name V2's asset paths. A name of our own keeps this project
 * from opening - and failing to validate - V2's test data. `.vpg` backups are
 * the way to carry a save between the two.
 */
export const DATABASE_NAME = "vpg-saves";
export const WORKSPACE_VERSION = 2;
export const FORMAT_VERSION = 2;
export const COMPONENTS = { controls: 1, audio: 1, preferences: 1, arenas: 1, drafts: 1, images: 1 } as const;
export type Component = keyof typeof COMPONENTS;

export interface GlobalSettings {
  controls: ControlMapping;
  audio: AudioSettings;
  preferences: { remindOnExit: boolean };
}

export interface ArenaRecovery {
  id: "editor";
  editingId: string | null;
  draft: ArenaDraft;
}

export type ImageMime = "image/png" | "image/jpeg";

/** Derived from the stored bytes: the id is their SHA-256, so equal bytes share one record. */
export interface ImageInfo {
  id: string;
  mime: ImageMime;
  width: number;
  height: number;
  byteLength: number;
}

/** One save's library membership: the shared image plus how this save names it. */
export interface LibraryImage extends ImageInfo {
  name: string;
  importedAt: string;
}

/** The repository's image record. Bytes stay out of the JSON workspace. */
export interface StoredImage extends ImageInfo {
  blob: Blob;
}

export interface SaveRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  arenas: ArenaData[];
  drafts: ArenaRecovery[];
  images: LibraryImage[];
  source?: { id: string; createdAt: string; exportedAt: string };
  lastBackup?: { attemptedAt: string; revision: number; settingsRevision: number };
}

export interface Workspace {
  schemaVersion: typeof WORKSPACE_VERSION;
  revision: number;
  activeSaveId: string;
  settingsRevision: number;
  settings: GlobalSettings;
  legacyMigrated: true;
  saves: SaveRecord[];
}

export interface BackupSnapshot {
  save: SaveRecord;
  settings: GlobalSettings;
  settingsRevision: number;
  /** Bytes for every image in `save.images`, keyed by id. */
  images: Map<string, Blob>;
}

export interface BackupEntry { path: string; component: Component; schemaVersion: 1; byteLength: number }
export interface BackupImageEntry extends BackupEntry { component: "images"; id: string; mime: ImageMime; width: number; height: number }

export interface BackupManifest {
  format: "virtual-pro-grappler";
  formatVersion: typeof FORMAT_VERSION;
  gameVersion: string;
  save: Pick<SaveRecord, "id" | "name" | "createdAt" | "updatedAt" | "revision">;
  exportedAt: string;
  settingsRevision: number;
  components: typeof COMPONENTS;
  entries: (BackupEntry | BackupImageEntry)[];
}

const MiB = 1024 * 1024;

export const LIMITS = {
  saves: 20,
  arenas: 100,
  /** Library size per save, counting unused images. */
  images: 64,
  libraryBytes: 64 * MiB,
  /** One stored (processed) image. */
  imageBytes: 4 * MiB,
  imageSide: 2048,
  imagePixels: 2048 * 2048,
  /** What an import may hand the decoder before it is downscaled. */
  importFileBytes: 32 * MiB,
  importSide: 16384,
  importPixels: 50_000_000,
  archiveBytes: 80 * MiB,
  entries: 192,
  /** One JSON entry, and all JSON entries together. */
  entryBytes: 64 * 1024,
  jsonBytes: 8 * MiB,
  extractedBytes: 72 * MiB,
} as const;

export function copy<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

export function newSave(name: string, now = new Date().toISOString()): SaveRecord {
  return { id: crypto.randomUUID(), name: name.trim(), createdAt: now, updatedAt: now, revision: 0, arenas: [], drafts: [], images: [] };
}
