import { afterEach, describe, expect, it, vi } from "vitest";
import { IDBFactory, IDBDatabase } from "fake-indexeddb";
import { IndexedDbRepository, type SaveRepository } from "../../src/data/save/repository";
import { SaveCoordinator } from "../../src/data/save/coordinator";
import { firstWorkspace, defaultSettings } from "../../src/data/save/migrations";
import { DATABASE_VERSION, copy, type StoredImage, type Workspace } from "../../src/data/save/types";
import { validateSettings, validateRecovery, validateWorkspace } from "../../src/data/save/validation";
import { arenaById, availableArenas, publishUserArenas } from "../../src/data/arenas";
import { cloneArena, draftToJson } from "../../src/data/arenaDraft";

const custom = () => draftToJson(cloneArena(arenaById("raw")!, "my_arena", "My Arena"));
const draft = () => ({ id: "editor" as const, editingId: null, draft: cloneArena(arenaById("raw")!, "unfinished", "Unfinished") });
const coordinators: SaveCoordinator[] = [];
const repositories: SaveRepository[] = [];
afterEach(() => { coordinators.forEach((c) => c.dispose()); repositories.forEach((r) => r.close()); publishUserArenas([]); });

class MemoryRepository implements SaveRepository {
  value: Workspace | null = null;
  images = new Map<string, Blob>();
  fail = false;
  gate: Promise<void> | null = null;
  writes = 0;
  async load() { return copy(this.value); }
  async commit(value: Workspace, revision: number | null, images: readonly StoredImage[] = []) {
    if (this.gate) await this.gate;
    if (this.fail) throw new Error("Quota exceeded");
    if ((this.value?.revision ?? null) !== revision) throw new Error("Stale revision");
    this.value = copy(value); this.writes++;
    for (const image of images) this.images.set(image.id, image.blob);
  }
  async readImages(ids: readonly string[]) { return new Map(ids.map((id) => [id, this.images.get(id)!])); }
  close() {}
}
function coordinator(repository = new MemoryRepository(), writer = true, legacy?: Map<string, string>) {
  const c = new SaveCoordinator({ openRepository: async () => repository, acquireWriter: async () => writer ? { release() {} } : null, legacyStorage: () => ({ getItem: (key) => legacy?.get(key) ?? null }), debounceMs: 60_000 });
  coordinators.push(c);
  return { c, repository };
}

describe("IndexedDB save transactions", () => {
  it("creates a workspace, reloads it and rejects stale writes", async () => {
    const factory = new IDBFactory();
    const repository = await IndexedDbRepository.open({ factory }); repositories.push(repository);
    expect(await repository.load()).toBeNull();
    const { workspace } = firstWorkspace();
    await repository.commit(workspace, null);
    const other = await IndexedDbRepository.open({ factory }); repositories.push(other);
    expect(await other.load()).toEqual(workspace);
    const updated = copy(workspace); updated.revision++;
    await repository.commit(updated, workspace.revision);
    await expect(other.commit(updated, workspace.revision)).rejects.toThrow("Another tab");
    expect(await other.load()).toEqual(updated);
  });

  it("retains the last committed state after an aborted transaction", async () => {
    const repository = await IndexedDbRepository.open({ factory: new IDBFactory() }); repositories.push(repository);
    const { workspace } = firstWorkspace(); await repository.commit(workspace, null);
    const real = IDBDatabase.prototype.transaction;
    vi.spyOn(IDBDatabase.prototype, "transaction").mockImplementationOnce(function (this: IDBDatabase, ...args: Parameters<typeof real>) {
      const tx = real.apply(this, args);
      queueMicrotask(() => tx.abort());
      return tx;
    });
    const changed = copy(workspace); changed.revision++; changed.settings.audio.volume = .9;
    await expect(repository.commit(changed, workspace.revision)).rejects.toThrow("aborted");
    expect(await repository.load()).toEqual(workspace);
  });

  it("reports blocked upgrades and does not create stores after the blocker closes", async () => {
    const factory = new IDBFactory();
    const blocker = await new Promise<IDBDatabase>((resolve) => { const req = factory.open("blocked", 1); req.onsuccess = () => resolve(req.result); });
    const upgradedFactory = Object.create(factory) as IDBFactory;
    upgradedFactory.open = (name, version) => factory.open(name, (version ?? 1) + 1);
    await expect(IndexedDbRepository.open({ factory: upgradedFactory, name: "blocked" })).rejects.toThrow("blocked");
    blocker.close();
    const unchanged = await new Promise<IDBDatabase>((resolve) => { const req = factory.open("blocked", 1); req.onsuccess = () => resolve(req.result); });
    expect(unchanged.objectStoreNames.length).toBe(0); unchanged.close();
    const old = await new Promise<IDBDatabase>((resolve) => { const req = factory.open("future", DATABASE_VERSION + 1); req.onsuccess = () => resolve(req.result); });
    old.close();
    await expect(IndexedDbRepository.open({ factory, name: "future" })).rejects.toThrow();
  });
});

describe("settings migration and save validation", () => {
  it("keeps intentional unbindings, gives overrides ownership and removes duplicate inputs", () => {
    const legacy = new Map([
      ["vpg-control-mappings", JSON.stringify({ bindings: { a: ["ArrowUp", "ArrowUp", 42], b: [] } })],
      ["vpg-audio", JSON.stringify({ muted: true, volume: 2 })],
    ]);
    const { workspace } = firstWorkspace({ getItem: (key) => legacy.get(key) ?? null });
    expect(workspace.settings.controls.bindings.a).toEqual(["ArrowUp"]);
    expect(workspace.settings.controls.bindings.b).toEqual([]);
    expect(workspace.settings.controls.bindings.dpadUp).toEqual([]);
    expect(workspace.settings.audio).toEqual({ muted: true, volume: 1 });
    expect(legacy.size).toBe(2);
    validateWorkspace(workspace);
  });

  it("recovers defaults without deleting corrupt legacy JSON", () => {
    const first = firstWorkspace({ getItem: () => "{invalid" });
    expect(first.warnings).toHaveLength(2);
    expect(first.workspace.settings).toEqual(defaultSettings());
  });

  it("rejects conflicting settings and unsupported components", () => {
    const settings = defaultSettings(); settings.controls.bindings.a = ["ArrowUp"];
    expect(() => validateSettings(settings)).toThrow("more than once");
    const { workspace } = firstWorkspace();
    expect(() => validateWorkspace({ ...workspace, futureWrestlers: [] })).toThrow();
  });

  it("recovers incomplete identities but rejects invalid draft resources", () => {
    const recovery = draft(); recovery.draft.id = "INVALID ID"; recovery.draft.displayName = "";
    expect(() => validateRecovery(recovery)).not.toThrow();
    recovery.draft.stage = "missing";
    expect(() => validateRecovery(recovery)).toThrow("Unknown stage");
  });
});

describe("ordered save coordinator", () => {
  it("initializes once and does not reapply legacy settings over database values", async () => {
    const legacy = new Map([["vpg-audio", '{"volume":0.8}']]);
    const { c, repository } = coordinator(undefined, true, legacy);
    await Promise.all([c.start(), c.start()]);
    expect(repository.writes).toBe(1);
    expect(c.activeSave.name).toBe("My Save");
    c.settingsChanged({ ...c.effectiveSettings, audio: { muted: false, volume: .2 } }); await c.flush();
    const reload = coordinator(repository, true, legacy).c; await reload.start();
    expect(reload.effectiveSettings.audio.volume).toBe(.2);
  });

  it("retries a failed first migration and preserves legacy input", async () => {
    const { c, repository } = coordinator(); repository.fail = true; await c.start();
    expect(c.status.mode).toBe("temporary"); expect(repository.value).toBeNull();
    repository.fail = false; const next = coordinator(repository).c; await next.start();
    expect(next.status.mode).toBe("persistent");
  });

  it("coalesces edits and saves a pending draft to its original save before switching", async () => {
    const { c, repository } = coordinator(); await c.start();
    const original = c.activeSave.id;
    c.settingsChanged({ ...c.effectiveSettings, audio: { muted: true, volume: .1 } });
    c.settingsChanged({ ...c.effectiveSettings, audio: { muted: false, volume: .7 } });
    c.draftChanged(original, draft());
    await c.createSave("Other"); const other = c.activeSave.id;
    expect(repository.writes).toBe(2);
    expect(c.workspace.value!.saves.find((save) => save.id === original)!.drafts).toHaveLength(1);
    expect(c.activeSave.drafts).toHaveLength(0);
    await c.switchSave(original);
    expect(c.effectiveSettings.audio.volume).toBe(.7);
    expect(c.activeSave.id).not.toBe(other);
  });

  it("serializes queued writes and retains a newer settings edit arriving during a commit", async () => {
    const { c, repository } = coordinator(); await c.start();
    let release!: () => void; repository.gate = new Promise<void>((resolve) => { release = resolve; });
    c.settingsChanged({ ...c.effectiveSettings, audio: { muted: false, volume: .2 } });
    const flush = c.flush();
    await vi.waitFor(() => expect(c.status.pending).toBe(1));
    c.settingsChanged({ ...c.effectiveSettings, audio: { muted: false, volume: .9 } });
    const create = c.createSave("Queued");
    release(); await Promise.all([flush, create]); await c.flush();
    expect(repository.value!.settings.audio.volume).toBe(.9);
    expect(c.status.unsaved).toBe(false);
    expect(c.activeSave.name).toBe("Queued");
  });

  it("keeps failed autosaves for retry and offers a valid export of current memory", async () => {
    const { c, repository } = coordinator(); await c.start();
    repository.fail = true;
    c.settingsChanged({ ...c.effectiveSettings, audio: { muted: true, volume: .4 } });
    await expect(c.flush()).rejects.toThrow("Quota");
    expect(repository.value!.settings.audio.muted).toBe(false);
    expect(c.status.unsaved).toBe(true);
    expect((await c.snapshot(true)).settings.audio.muted).toBe(true);
    repository.fail = false; await c.flush();
    expect(repository.value!.settings.audio.muted).toBe(true);
    expect(c.status.error).toBe("");
  });

  it("does not publish an arena when its transaction fails", async () => {
    const { c, repository } = coordinator(); await c.start(); repository.fail = true;
    await expect(c.putArena(custom())).rejects.toThrow("Quota");
    expect(c.activeSave.arenas).toHaveLength(0);
  });

  it("publishes user arenas reactively and leaves bundled content intact after deletion", async () => {
    const { c } = coordinator(); await c.start(); await c.putArena(custom());
    publishUserArenas(c.activeSave.arenas);
    expect(availableArenas().some((arena) => arena.id === "my_arena")).toBe(true);
    expect(arenaById("raw")).not.toBeNull();
    await c.deleteArena("my_arena"); publishUserArenas(c.activeSave.arenas);
    expect(arenaById("my_arena")).toBeNull(); expect(arenaById("raw")).not.toBeNull();
  });

  it("restores atomically with optional settings and preserves replacement creation time", async () => {
    const { c, repository } = coordinator(); await c.start(); await c.putArena(custom());
    const snapshot = await c.snapshot();
    const created = c.activeSave.createdAt;
    await c.createSave("Destination"); const destination = c.activeSave.id;
    c.settingsChanged({ ...c.effectiveSettings, audio: { muted: true, volume: .6 } }); await c.flush();
    repository.fail = true;
    await expect(c.restore(snapshot, { replace: true, settings: true, exportedAt: created })).rejects.toThrow();
    expect(c.activeSave.id).toBe(destination); expect(c.activeSave.arenas).toHaveLength(0); expect(c.effectiveSettings.audio.muted).toBe(true);
    repository.fail = false;
    await c.restore(snapshot, { replace: true, settings: false, exportedAt: created });
    expect(c.activeSave.id).toBe(destination); expect(c.activeSave.arenas).toHaveLength(1); expect(c.effectiveSettings.audio.muted).toBe(true);
    const replacementCreated = c.activeSave.createdAt;
    await c.restore(snapshot, { replace: true, settings: true, exportedAt: created });
    expect(c.activeSave.createdAt).toBe(replacementCreated); expect(c.effectiveSettings.audio.muted).toBe(false);
    await c.restore(snapshot, { replace: false, settings: false, exportedAt: created });
    expect(c.activeSave.id).not.toBe(snapshot.save.id); expect(c.activeSave.source?.id).toBe(snapshot.save.id);
  });

  it("records export attempts without changing content revisions and tracks global changes", async () => {
    const { c } = coordinator(); await c.start();
    const snapshot = await c.snapshot(); await c.recordBackupAttempt(snapshot, new Date().toISOString());
    expect(c.activeSave.revision).toBe(snapshot.save.revision); expect(c.needsBackup).toBe(false);
    c.settingsChanged({ ...c.effectiveSettings, audio: { muted: true, volume: .5 } });
    expect(c.needsBackup).toBe(true); await c.flush(); expect(c.needsBackup).toBe(true);
  });

  it("uses an exportable temporary session when another tab holds the writer lock", async () => {
    const { c, repository } = coordinator(undefined, false); await c.start(); await c.putArena(custom());
    expect(c.status.mode).toBe("temporary"); expect(repository.writes).toBe(0);
    expect((await c.snapshot()).save.arenas).toHaveLength(1);
  });
});
