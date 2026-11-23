import { AUDIO_STORAGE_KEY } from "../../audio/menuAudio";
import { PAD_CONTROLS, STORAGE_KEY, defaultMapping } from "../controls";
import { WORKSPACE_VERSION, copy, newSave, type GlobalSettings, type Workspace } from "./types";
import { validateSettings, validateWorkspaceV1 } from "./validation";

export function defaultSettings(): GlobalSettings {
  return { controls: defaultMapping(), audio: { muted: false, volume: 0.5 }, preferences: { remindOnExit: true } };
}

/** Legacy localStorage is consulted only when the database has no committed workspace. */
export function firstWorkspace(storage?: Pick<Storage, "getItem"> | null): { workspace: Workspace; warnings: string[] } {
  const settings = defaultSettings();
  const warnings: string[] = [];
  const read = (key: string): unknown => {
    try { const value = storage?.getItem(key); return value ? JSON.parse(value) : null; }
    catch { warnings.push(`Could not migrate ${key}; its original value was preserved.`); return null; }
  };
  const controls = read(STORAGE_KEY) as { bindings?: Record<string, unknown> } | null;
  if (controls?.bindings && typeof controls.bindings === "object") {
    const explicit = new Set<string>();
    const present = new Set<string>();
    const pattern = /^([A-Za-z][A-Za-z0-9]*|mouse:[0-9]+|gamepad:button:[0-9]+|gamepad:axis:[0-9]+:(positive|negative))$/;
    for (const control of PAD_CONTROLS) {
      const values = controls.bindings[control];
      if (!Array.isArray(values)) continue;
      present.add(control);
      settings.controls.bindings[control] = values.filter((input): input is string => {
        if (typeof input !== "string" || !pattern.test(input) || explicit.has(input)) return false;
        explicit.add(input);
        return true;
      });
    }
    // Explicit overrides take ownership from missing controls' defaults.
    for (const control of PAD_CONTROLS) if (!present.has(control)) {
      settings.controls.bindings[control] = settings.controls.bindings[control].filter((input) => !explicit.has(input));
    }
  }
  const audio = read(AUDIO_STORAGE_KEY) as Record<string, unknown> | null;
  if (typeof audio?.muted === "boolean") settings.audio.muted = audio.muted;
  if (typeof audio?.volume === "number" && Number.isFinite(audio.volume)) settings.audio.volume = Math.min(1, Math.max(0, audio.volume));
  validateSettings(settings);
  const save = newSave("My Save");
  return { workspace: { schemaVersion: WORKSPACE_VERSION, revision: 0, activeSaveId: save.id, settingsRevision: 0, settings, legacyMigrated: true, saves: [save] }, warnings };
}

/**
 * Explicit, lossless steps from each earlier local shape. v1 predates imported
 * images, so each of its saves starts with an empty library. The result is
 * written back as v2 by the next commit.
 */
export function migrateWorkspace(value: unknown): Workspace {
  const version = value && typeof value === "object" ? (value as { schemaVersion?: unknown }).schemaVersion : undefined;
  if (version === WORKSPACE_VERSION) return copy(value as Workspace);
  if (version !== 1) throw new Error("Unsupported local save version.");
  validateWorkspaceV1(value);
  const workspace = copy(value) as unknown as Workspace;
  workspace.schemaVersion = WORKSPACE_VERSION;
  for (const save of workspace.saves) save.images = [];
  return workspace;
}
