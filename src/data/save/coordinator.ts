import { reactive, shallowRef } from "vue";
import type { ArenaData } from "../arenas";
import { firstWorkspace } from "./migrations";
import { IndexedDbRepository, type SaveRepository } from "./repository";
import { DATABASE_NAME, LIMITS, copy, newSave, type ArenaRecovery, type BackupSnapshot, type GlobalSettings, type LibraryImage, type SaveRecord, type StoredImage, type Workspace } from "./types";
import { libraryIds, validateRecovery, validateSave, validateSettings, validateWorkspace } from "./validation";
import { imageUsage, type PreparedImage } from "./images";

export interface WriterLease { release(): void }

/** Held until the page is disposed. A second tab gets a labeled temporary session. */
export async function acquireWriter(): Promise<WriterLease | null> {
  if (!globalThis.navigator?.locks) throw new Error("This browser cannot coordinate local saves between tabs.");
  return new Promise((resolve, reject) => {
    void navigator.locks.request(`${DATABASE_NAME}-writer`, { ifAvailable: true }, async (lock) => {
      if (!lock) { resolve(null); return; }
      await new Promise<void>((release) => resolve({ release }));
    }).catch(reject);
  });
}

interface Options {
  openRepository?: () => Promise<SaveRepository>;
  acquireWriter?: () => Promise<WriterLease | null>;
  legacyStorage?: () => Pick<Storage, "getItem"> | null;
  onPublish?: (workspace: Workspace) => void;
  debounceMs?: number;
  storageEstimate?: () => Promise<StorageEstimate | null>;
}

/** Headroom an import or restore leaves for the records written beside its bytes. */
const STORAGE_MARGIN = 1024 * 1024;

async function browserEstimate(): Promise<StorageEstimate | null> {
  try { return await globalThis.navigator?.storage?.estimate?.() ?? null; }
  catch { return null; }
}

export class SaveCoordinator {
  readonly workspace = shallowRef<Workspace | null>(null);
  readonly status = reactive({ ready: false, mode: "temporary" as "persistent" | "temporary", reason: "", error: "", pending: 0, unsaved: false, persistentStorage: null as boolean | null });
  private repository: SaveRepository | null = null;
  private lease: WriterLease | null = null;
  private tail: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pendingSettings: GlobalSettings | null = null;
  private pendingDrafts = new Map<string, { value: ArenaRecovery | null; sequence: number }>();
  private sequence = 0;
  private starting: Promise<void> | null = null;
  /** Image bytes a temporary session holds itself, since it never writes to the database. */
  private memoryImages = new Map<string, Blob>();

  constructor(private options: Options = {}) {}

  get effectiveSettings(): GlobalSettings { return copy(this.pendingSettings ?? this.workspace.value!.settings); }

  get activeSave(): SaveRecord {
    const state = this.workspace.value;
    if (!state) throw new Error("Saves have not loaded yet.");
    return state.saves.find((save) => save.id === state.activeSaveId)!;
  }

  get needsBackup(): boolean {
    const state = this.workspace.value;
    if (!state) return false;
    const save = this.activeSave;
    return this.status.unsaved || !save.lastBackup || save.lastBackup.revision !== save.revision || save.lastBackup.settingsRevision !== state.settingsRevision;
  }

  start(): Promise<void> { return this.starting ??= this.initialize(); }

  private async initialize(): Promise<void> {
    let warning = "";
    try {
      try {
        this.lease = await (this.options.acquireWriter ?? acquireWriter)();
        if (!this.lease) warning = "Another game tab owns local saves. Close it and reload to save here.";
      } catch (error) { warning = message(error); }
      this.repository = await (this.options.openRepository ?? (() => IndexedDbRepository.open({ onInvalidated: () => this.invalidated() })))();
      let workspace = await this.repository.load();
      if (!workspace) {
        const first = this.createFirst();
        workspace = first.workspace;
        if (this.lease) await this.repository.commit(workspace, null);
      }
      if (this.lease) this.status.mode = "persistent";
      this.status.reason = warning;
      this.publish(workspace);
    } catch (error) {
      this.repository?.close();
      this.repository = null;
      this.lease?.release();
      this.lease = null;
      this.status.reason = message(error);
      this.publish(this.createFirst().workspace);
    }
    this.status.ready = true;
  }

  private createFirst() {
    let storage: Pick<Storage, "getItem"> | null = null;
    try { storage = this.options.legacyStorage ? this.options.legacyStorage() : globalThis.localStorage; } catch { /* Defaults remain usable. */ }
    const first = firstWorkspace(storage);
    if (first.warnings.length) this.status.error = first.warnings.join(" ");
    return first;
  }

  private invalidated(): void {
    // Do not switch to temporary mode and falsely acknowledge writes after a connection loss.
    this.status.error = "Local storage changed or closed. Reload to reconnect; pending changes can be exported.";
    this.repository?.close();
    this.repository = null;
  }

  private publish(workspace: Workspace): void {
    this.workspace.value = copy(workspace);
    this.options.onPublish?.(copy(workspace));
  }

  settingsChanged(settings: GlobalSettings): void {
    validateSettings(settings);
    this.pendingSettings = copy(settings);
    this.schedule();
  }

  draftChanged(saveId: string, value: ArenaRecovery | null): void {
    const save = this.workspace.value?.saves.find((candidate) => candidate.id === saveId);
    if (value) validateRecovery(value, save ? libraryIds(save) : new Set());
    this.pendingDrafts.set(saveId, { value: copy(value), sequence: ++this.sequence });
    this.schedule();
  }

  private schedule(): void {
    this.status.unsaved = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush().catch(() => { /* Visible in status, retained for retry/export. */ }); }, this.options.debounceMs ?? 250);
  }

  private applyPending(next: Workspace, settings: GlobalSettings | null, drafts: Map<string, { value: ArenaRecovery | null; sequence: number }>): void {
    if (settings && JSON.stringify(next.settings) !== JSON.stringify(settings)) {
      next.settings = copy(settings);
      next.settingsRevision++;
    }
    for (const [id, pending] of drafts) {
      const save = next.saves.find((candidate) => candidate.id === id);
      if (!save) throw new Error("A pending draft belongs to a removed save.");
      const draft = pending.value ? [copy(pending.value)] : [];
      if (JSON.stringify(save.drafts) !== JSON.stringify(draft)) { save.drafts = draft; touch(save); }
    }
  }

  /** `images` supplies bytes for library entries the mutation adds. */
  private change(mutate: (workspace: Workspace) => void, images: readonly StoredImage[] = []): Promise<void> {
    this.status.pending++;
    // All writes join one promise tail. IndexedDB transactions are ordered,
    // but callers can still request changes concurrently; serializing here
    // means each mutation validates against the workspace produced by the
    // previous mutation rather than racing a stale Vue snapshot.
    const operation = this.tail.then(async () => {
      if (!this.workspace.value) throw new Error("Saves have not loaded yet.");
      const current = this.workspace.value;
      const next = copy(current);
      const settings = this.pendingSettings;
      const drafts = new Map(this.pendingDrafts);
      this.applyPending(next, settings, drafts);
      mutate(next);
      next.revision++;
      // Validation happens before the repository sees the new workspace. This
      // keeps invalid application state out of both persistent IndexedDB and
      // the temporary in-memory session.
      validateWorkspace(next);
      if (this.status.mode === "persistent") {
        if (!this.repository) throw new Error("Local storage is disconnected. Reload or export your changes.");
        await this.repository.commit(next, current.revision, images);
      } else {
        for (const image of images) this.memoryImages.set(image.id, image.blob);
        const kept = new Set(next.saves.flatMap((save) => save.images.map((image) => image.id)));
        for (const id of this.memoryImages.keys()) if (!kept.has(id)) this.memoryImages.delete(id);
      }
      if (this.pendingSettings === settings) this.pendingSettings = null;
      for (const [id, value] of drafts) if (this.pendingDrafts.get(id)?.sequence === value.sequence) this.pendingDrafts.delete(id);
      this.status.unsaved = !!this.pendingSettings || !!this.pendingDrafts.size;
      this.status.error = "";
      this.publish(next);
    }).catch((error) => { this.status.error = message(error); throw error; }).finally(() => { this.status.pending--; });
    this.tail = operation.catch(() => {});
    return operation;
  }

  async flush(): Promise<void> {
    clearTimeout(this.timer);
    await this.tail;
    if (this.pendingSettings || this.pendingDrafts.size) await this.change(() => {});
  }

  async putArena(arena: ArenaData): Promise<void> {
    const id = this.activeSave.id;
    const captured = copy(arena);
    await this.change((next) => {
      const save = next.saves.find((candidate) => candidate.id === id)!;
      const index = save.arenas.findIndex((candidate) => candidate.id === captured.id);
      if (index < 0) save.arenas.push(captured); else save.arenas[index] = captured;
      // The committed arena supersedes its recovery copy.
      save.drafts = save.drafts.filter((recovery) => recovery.draft.id !== captured.id);
      touch(save);
    });
  }

  async deleteArena(id: string): Promise<void> {
    const saveId = this.activeSave.id;
    await this.change((next) => {
      const save = next.saves.find((candidate) => candidate.id === saveId)!;
      save.arenas = save.arenas.filter((arena) => arena.id !== id);
      save.drafts = save.drafts.filter((draft) => draft.editingId !== id);
      touch(save);
    });
  }

  /** The committed workspace with pending edits applied, for checks made before queueing a change. */
  private pendingView(): Workspace {
    const view = copy(this.workspace.value!);
    this.applyPending(view, this.pendingSettings, this.pendingDrafts);
    return view;
  }

  /** Refuses a write that the browser's reported quota cannot hold. Unknown quotas are left to the transaction. */
  private async ensureSpace(bytes: number): Promise<void> {
    if (this.status.mode !== "persistent" || !bytes) return;
    const estimate = await (this.options.storageEstimate ?? browserEstimate)();
    if (estimate?.quota == null || estimate.usage == null) return;
    if (estimate.quota - estimate.usage < bytes + STORAGE_MARGIN) throw new Error("Not enough browser storage for these images. Free space or delete unused images, then retry.");
  }

  /**
   * Adds prepared bytes to the selected save's library. Bytes already in the
   * library return the existing entry; bytes another save holds are shared.
   * The import stays with the save that was selected when it began.
   */
  async importImage(prepared: PreparedImage, name: string): Promise<{ image: LibraryImage; duplicate: boolean }> {
    const saveId = this.activeSave.id;
    const libraryFull = (save: SaveRecord) => {
      if (save.images.length >= LIMITS.images) return `This save already holds ${LIMITS.images} imported images. Delete unused ones first.`;
      if (save.images.reduce((sum, image) => sum + image.byteLength, 0) + prepared.info.byteLength > LIMITS.libraryBytes) return "This image would take the save's imported images past 64 MiB. Delete unused ones first.";
      return null;
    };
    if (prepared.blob.size !== prepared.info.byteLength) throw new Error("The prepared image does not match its recorded size.");
    const existing = this.activeSave.images.find((image) => image.id === prepared.info.id);
    if (existing) return { image: copy(existing), duplicate: true };
    const refusal = libraryFull(this.activeSave);
    if (refusal) throw new Error(refusal);
    await this.ensureSpace(prepared.info.byteLength);
    const image: LibraryImage = { ...prepared.info, name: name.trim() || "Imported image", importedAt: new Date().toISOString() };
    let result = { image, duplicate: false };
    await this.change((next) => {
      const save = next.saves.find((candidate) => candidate.id === saveId);
      if (!save) throw new Error("The save was removed before the image was imported.");
      const found = save.images.find((candidate) => candidate.id === image.id);
      if (found) { result = { image: found, duplicate: true }; return; }
      const full = libraryFull(save);
      if (full) throw new Error(full);
      save.images.push(image);
      touch(save);
    }, [{ ...prepared.info, blob: prepared.blob }]);
    return { image: copy(result.image), duplicate: result.duplicate };
  }

  /** Refuses while any arena or the recovery draft uses the image; bytes go once no save lists them. */
  async deleteImage(id: string): Promise<void> {
    const saveId = this.activeSave.id;
    const refusal = (save: SaveRecord) => {
      const image = save.images.find((candidate) => candidate.id === id);
      if (!image) return "That image is not in this save.";
      const uses = imageUsage(save, id);
      return uses.length ? `“${image.name}” is used by ${uses.join(", ")}. Change those textures before deleting it.` : null;
    };
    const blocked = refusal(this.pendingView().saves.find((save) => save.id === saveId)!);
    if (blocked) throw new Error(blocked);
    await this.change((next) => {
      const save = next.saves.find((candidate) => candidate.id === saveId)!;
      const raced = refusal(save);
      if (raced) throw new Error(raced);
      save.images = save.images.filter((image) => image.id !== id);
      touch(save);
    });
  }

  /** Bytes for imported images, read in queue order so a concurrent commit cannot remove them midway. */
  readImages(ids: readonly string[]): Promise<Map<string, Blob>> {
    const read = this.tail.then(async () => {
      const out = new Map<string, Blob>();
      const missing: string[] = [];
      for (const id of ids) {
        const blob = this.memoryImages.get(id);
        if (blob) out.set(id, blob); else missing.push(id);
      }
      if (missing.length) {
        if (!this.repository) throw new Error("Imported image data is unavailable. Reload to reconnect local storage.");
        for (const [id, blob] of await this.repository.readImages(missing)) out.set(id, blob);
      }
      return out;
    });
    this.tail = read.then(() => {}, () => {});
    return read;
  }

  async switchSave(id: string): Promise<void> {
    await this.flush();
    await this.change((next) => {
      if (!next.saves.some((save) => save.id === id)) throw new Error("Save does not exist.");
      next.activeSaveId = id;
    });
  }

  async createSave(name: string): Promise<void> {
    const save = newSave(name);
    await this.change((next) => { next.saves.push(save); next.activeSaveId = save.id; });
  }

  async renameSave(name: string): Promise<void> {
    const id = this.activeSave.id;
    await this.change((next) => { const save = next.saves.find((save) => save.id === id)!; save.name = name.trim(); touch(save); });
  }

  async deleteSave(id: string): Promise<void> {
    await this.change((next) => {
      if (next.saves.length <= 1) throw new Error("Keep at least one local save.");
      next.saves = next.saves.filter((save) => save.id !== id);
      if (next.activeSaveId === id) next.activeSaveId = next.saves[0].id;
    });
  }

  async snapshot(allowPending = false): Promise<BackupSnapshot> {
    try { await this.flush(); } catch (error) { if (!allowPending) throw error; }
    const next = copy(this.workspace.value!);
    if (allowPending) this.applyPending(next, this.pendingSettings, this.pendingDrafts);
    validateWorkspace(next);
    const save = next.saves.find((candidate) => candidate.id === next.activeSaveId)!;
    const images = await this.readImages(save.images.map((image) => image.id));
    return { save, settings: next.settings, settingsRevision: next.settingsRevision, images };
  }

  async recordBackupAttempt(snapshot: BackupSnapshot, attemptedAt: string): Promise<void> {
    // A temporary export or an export containing failed writes has no committed revision to mark.
    if (this.status.unsaved) return;
    await this.change((next) => {
      const save = next.saves.find((save) => save.id === snapshot.save.id);
      if (save?.revision === snapshot.save.revision && next.settingsRevision === snapshot.settingsRevision) {
        save.lastBackup = { attemptedAt, revision: snapshot.save.revision, settingsRevision: snapshot.settingsRevision };
      }
    });
  }

  async restore(snapshot: BackupSnapshot, options: { replace: boolean; settings: boolean; exportedAt: string }): Promise<void> {
    const prepared = { save: copy(snapshot.save), settings: copy(snapshot.settings) };
    validateSave(prepared.save);
    validateSettings(prepared.settings);
    const images: StoredImage[] = prepared.save.images.map(({ name, importedAt: _importedAt, ...info }) => {
      const blob = snapshot.images.get(info.id);
      if (!blob || blob.size !== info.byteLength) throw new Error(`Backup image “${name}” is missing or incomplete.`);
      return { ...info, blob };
    });
    await this.ensureSpace(images.reduce((sum, image) => sum + image.byteLength, 0));
    await this.change((next) => {
      const now = new Date().toISOString();
      const current = next.saves.find((save) => save.id === next.activeSaveId)!;
      const restored = newSave(prepared.save.name, now);
      restored.arenas = prepared.save.arenas;
      restored.drafts = prepared.save.drafts;
      restored.images = prepared.save.images;
      restored.source = { id: prepared.save.id, createdAt: prepared.save.createdAt, exportedAt: options.exportedAt };
      if (options.replace) {
        restored.id = current.id;
        restored.createdAt = current.createdAt;
        restored.revision = current.revision + 1;
        next.saves[next.saves.indexOf(current)] = restored;
      } else next.saves.push(restored);
      if (options.settings) { next.settings = prepared.settings; next.settingsRevision++; }
      next.activeSaveId = restored.id;
    }, images);
  }

  async requestPersistentStorage(): Promise<void> {
    try { this.status.persistentStorage = await navigator.storage.persist(); }
    catch (error) { this.status.error = message(error); }
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.repository?.close();
    this.lease?.release();
  }
}

function touch(save: SaveRecord): void { save.revision++; save.updatedAt = new Date().toISOString(); }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
