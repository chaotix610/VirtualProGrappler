import { applyMapping, exportMapping, setMappingPersistence } from "../controls";
import { applyAudioSettings, exportAudioSettings, setAudioPersistence } from "../../audio/menuAudio";
import { publishUserArenas, isBundledArena } from "../arenas";
import { SaveCoordinator } from "./coordinator";
import { LIMITS, copy, type ArenaRecovery, type LibraryImage } from "./types";
import { libraryIds, validateRecovery } from "./validation";
import { libraryName, prepareImport, verifyDecodes } from "./images";
import { browserCodec } from "./imageCodec";
import type { decodeBackup } from "./archive";

export const saves = new SaveCoordinator({
  onPublish(workspace) {
    publishUserArenas(workspace.saves.find((save) => save.id === workspace.activeSaveId)!.arenas);
    const settings = saves.effectiveSettings;
    applyMapping(settings.controls);
    applyAudioSettings(settings.audio);
  },
});

export async function startSaves(): Promise<void> {
  await saves.start();
  const changed = () => saves.settingsChanged({ ...saves.effectiveSettings, controls: exportMapping(), audio: exportAudioSettings() });
  setMappingPersistence(changed);
  setAudioPersistence(changed);
  // migrateArenaDraft() is not called yet. The arena editor still parks its
  // draft in sessionStorage across hot reloads and only reads it back from
  // there; moving it into the save before the editor reads recovery records
  // from the save (save-system stage 3) would hide the draft from the editor.
}

if (import.meta.hot) import.meta.hot.dispose(() => saves.dispose());

export const LEGACY_DRAFT_KEY = "vpg.arenaEditor.draft";

/**
 * Only a supported, resource-valid draft migrates, and its original survives
 * until commit. Wired in with save-backed editor recovery; see startSaves().
 */
export async function migrateArenaDraft(): Promise<void> {
  if (saves.status.mode !== "persistent" || saves.activeSave.drafts.length) return;
  try {
    const raw = sessionStorage.getItem(LEGACY_DRAFT_KEY);
    if (!raw) return;
    const parked = JSON.parse(raw);
    const recovery: ArenaRecovery = { id: "editor", editingId: parked.editingId ?? null, draft: copy(parked.draft) };
    if (recovery.editingId && isBundledArena(recovery.editingId)) {
      recovery.editingId = null;
      recovery.draft.id = `${recovery.draft.id}_copy`;
    }
    validateRecovery(recovery, libraryIds(saves.activeSave));
    saves.draftChanged(saves.activeSave.id, recovery);
    await saves.flush();
    sessionStorage.removeItem(LEGACY_DRAFT_KEY);
  } catch (error) {
    saves.status.error = `Previous editor draft was preserved but could not be migrated: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/** Lazy archive code keeps ZIP tooling out of the main menu bundle. */
export async function downloadBackup(): Promise<void> {
  const snapshot = await saves.snapshot(true);
  const { encodeBackup } = await import("./archive");
  const bytes = await encodeBackup(snapshot);
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: "application/zip" }));
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${snapshot.save.name.replace(/[^a-zA-Z0-9_-]/g, "_") || "my-save"}.vpg`;
    document.body.append(anchor);
    try { anchor.click(); } finally { anchor.remove(); }
    await saves.recordBackupAttempt(snapshot, new Date().toISOString());
  } finally { setTimeout(() => URL.revokeObjectURL(url), 30_000); }
}

/** Decodes, re-encodes and stores a chosen file in the selected save's library. */
export async function importImageFile(file: File): Promise<{ image: LibraryImage; duplicate: boolean }> {
  const prepared = await prepareImport(file, browserCodec);
  return saves.importImage(prepared, libraryName(file.name));
}

export type StagedBackup = Awaited<ReturnType<typeof decodeBackup>>;

/** Everything a restore needs is extracted and checked here, before any write is offered. */
export async function stageBackup(file: File): Promise<StagedBackup> {
  if (file.size > LIMITS.archiveBytes) throw new Error("Backup exceeds 80 MiB.");
  const { decodeBackup } = await import("./archive");
  const staged = await decodeBackup(new Uint8Array(await file.arrayBuffer()));
  await verifyDecodes(staged.snapshot.save.images, staged.snapshot.images, browserCodec);
  return staged;
}
