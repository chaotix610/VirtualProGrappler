import { DATABASE_NAME, DATABASE_VERSION, copy, type StoredImage, type Workspace } from "./types";
import { validateWorkspace } from "./validation";
import { migrateWorkspace } from "./migrations";

export interface SaveRepository {
  load(): Promise<Workspace | null>;
  /** `images` supplies bytes for library entries the store does not hold yet. */
  commit(workspace: Workspace, expectedRevision: number | null, images?: readonly StoredImage[]): Promise<void>;
  readImages(ids: readonly string[]): Promise<Map<string, Blob>>;
  close(): void;
}

type Metadata = Omit<Workspace, "saves">;

function completion(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Local save transaction was aborted."));
    transaction.onerror = () => { /* onabort reports the final transaction outcome. */ };
  });
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}

function referenced(saves: Workspace["saves"]): Set<string> {
  return new Set(saves.flatMap((save) => save.images.map((image) => image.id)));
}

/**
 * Three stores, written in one transaction: global metadata/settings, complete
 * save records and image bytes. Bytes are shared by content id; a commit
 * deletes any that no save lists any more.
 */
export class IndexedDbRepository implements SaveRepository {
  private constructor(private database: IDBDatabase) {}

  static open(options: { factory?: IDBFactory; name?: string; onInvalidated?: () => void; timeoutMs?: number } = {}): Promise<IndexedDbRepository> {
    return new Promise((resolve, reject) => {
      const factory = options.factory ?? globalThis.indexedDB;
      if (!factory) return reject(new Error("Browser storage is unavailable."));
      let settled = false;
      const fail = (error: unknown) => { settled = true; clearTimeout(timer); reject(error); };
      const timer = setTimeout(() => fail(new Error("Opening local storage timed out. Close other game tabs and retry.")), options.timeoutMs ?? 4000);
      let opening: IDBOpenDBRequest;
      try { opening = factory.open(options.name ?? DATABASE_NAME, DATABASE_VERSION); }
      catch (error) { fail(error); return; }
      opening.onupgradeneeded = (event) => {
        // A blocked/timed-out request can resume later; never mutate after reporting failure.
        if (settled) { opening.transaction?.abort(); return; }
        const db = opening.result;
        // Each step adds only its own stores, so an existing database keeps its records.
        if (event.oldVersion < 1) {
          db.createObjectStore("metadata");
          db.createObjectStore("saves", { keyPath: "id" });
        }
        if (event.oldVersion < 2) db.createObjectStore("images", { keyPath: "id" });
      };
      opening.onblocked = () => fail(new Error("Local storage upgrade is blocked by another game tab. Close it and reload."));
      opening.onerror = () => fail(opening.error ?? new Error("Could not open browser storage."));
      opening.onsuccess = () => {
        clearTimeout(timer);
        const db = opening.result;
        if (settled) { db.close(); return; }
        settled = true;
        db.onversionchange = () => { db.close(); options.onInvalidated?.(); };
        db.onclose = () => options.onInvalidated?.();
        resolve(new IndexedDbRepository(db));
      };
    });
  }

  async load(): Promise<Workspace | null> {
    const tx = this.database.transaction(["metadata", "saves", "images"], "readonly");
    const done = completion(tx);
    const [metadata, saves, keys] = await Promise.all([
      request(tx.objectStore("metadata").get("workspace")) as Promise<Metadata | undefined>,
      request(tx.objectStore("saves").getAll()),
      request(tx.objectStore("images").getAllKeys()), done,
    ]);
    if (!metadata) {
      if (saves.length) throw new Error("Local save metadata is missing. Existing records were preserved.");
      return null;
    }
    const workspace = migrateWorkspace({ ...metadata, saves });
    validateWorkspace(workspace);
    const stored = new Set(keys);
    if ([...referenced(workspace.saves)].some((id) => !stored.has(id))) throw new Error("Imported image data is missing from local storage. Existing records were preserved.");
    return workspace;
  }

  async commit(workspace: Workspace, expectedRevision: number | null, images: readonly StoredImage[] = []): Promise<void> {
    validateWorkspace(workspace);
    if (workspace.revision !== (expectedRevision ?? -1) + 1) throw new Error("Invalid local save revision.");
    const snapshot = copy(workspace);
    const { saves, ...metadata } = snapshot;
    const tx = this.database.transaction(["metadata", "saves", "images"], "readwrite");
    const done = completion(tx);
    let conflict: Error | null = null;
    const fail = (error: unknown) => { conflict = error instanceof Error ? error : new Error(String(error)); tx.abort(); };
    const current = tx.objectStore("metadata").get("workspace");
    current.onsuccess = () => {
      if ((current.result?.revision ?? null) !== expectedRevision) {
        fail(new Error("Another tab changed local saves. Reload before saving again."));
        return;
      }
      try {
        tx.objectStore("metadata").put(metadata, "workspace");
        const store = tx.objectStore("saves");
        store.clear();
        for (const save of saves) store.put(save);
        const bytes = tx.objectStore("images");
        const keys = bytes.getAllKeys();
        keys.onsuccess = () => {
          try {
            const held = new Set(keys.result as string[]);
            const needed = referenced(saves);
            for (const image of images) if (needed.has(image.id) && !held.has(image.id)) { bytes.put(image); held.add(image.id); }
            for (const id of held) if (!needed.has(id)) bytes.delete(id);
            if ([...needed].some((id) => !held.has(id))) fail(new Error("Imported image bytes are missing, so the change was not saved."));
          } catch (error) { fail(error); }
        };
      } catch (error) { fail(error); }
    };
    try { await done; } catch (error) { throw conflict ?? error; }
  }

  async readImages(ids: readonly string[]): Promise<Map<string, Blob>> {
    const tx = this.database.transaction("images", "readonly");
    const done = completion(tx);
    const store = tx.objectStore("images");
    const records = await Promise.all(ids.map((id) => request(store.get(id)) as Promise<StoredImage | undefined>));
    await done;
    const out = new Map<string, Blob>();
    records.forEach((record, i) => {
      if (!record) throw new Error("Imported image data is missing from local storage.");
      out.set(ids[i], record.blob);
    });
    return out;
  }

  close(): void { this.database.close(); }
}
