import Ajv2020, { type ValidateFunction } from "ajv/dist/2020.js";
import arenaSchema from "#data/schemas/arenas.schema.json";
import controlsSchema from "#data/schemas/control-mappings.schema.json";
import workspaceV1Schema from "#data/schemas/save-v1.schema.json";
import workspaceSchema from "#data/schemas/save-v2.schema.json";
import manifestV1Schema from "#data/schemas/backup-v1.schema.json";
import manifestSchema from "#data/schemas/backup-v2.schema.json";
import { bundledArenaIds, type ArenaData } from "../arenas";
import { resolveAsset } from "../assets";
import { stageById, pieceFitsStage } from "../stages";
import { ringByGlb } from "../rings";
import { TEXTURE_SLOTS, pathBelongsToSlot, LEGACY_COLOR_TARGETS } from "../textureSlots";
import { PAD_CONTROLS, type ControlMapping } from "../controls";
import { isUserImageRef, userImageId } from "./images";
import { LIMITS, copy, type Workspace, type GlobalSettings, type ArenaRecovery, type BackupManifest, type SaveRecord, type ImageInfo } from "./types";

const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addFormat("date-time", { type: "string", validate: (v: string) => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v });
ajv.addSchema(arenaSchema).addSchema(controlsSchema).addSchema(workspaceV1Schema).addSchema(workspaceSchema);
const workspaceV1Validator = ajv.getSchema(workspaceV1Schema.$id)!;
const workspaceValidator = ajv.getSchema(workspaceSchema.$id)!;
const settingsValidator = ajv.compile({ $ref: `${workspaceSchema.$id}#/$defs/settings` });
const saveValidator = ajv.compile({ $ref: `${workspaceSchema.$id}#/$defs/save` });
const recoveryValidator = ajv.compile({ $ref: `${workspaceSchema.$id}#/$defs/recovery` });
const arenaValidator = ajv.getSchema(arenaSchema.$id)!;
const manifestV1Validator = ajv.compile(manifestV1Schema);
const manifestValidator = ajv.compile(manifestSchema);

function schema(check: ValidateFunction, value: unknown, label: string): void {
  if (!check(value)) throw new Error(`${label}: ${ajv.errorsText(check.errors, { separator: "; " })}`);
}

export function validateControls(mapping: ControlMapping): void {
  schema(ajv.getSchema(controlsSchema.$id)!, mapping, "Controls");
  const owners = new Set<string>();
  for (const control of PAD_CONTROLS) for (const input of mapping.bindings[control]) {
    if (owners.has(input)) throw new Error(`Control input ${input} is assigned more than once.`);
    owners.add(input);
  }
}

export function validateSettings(value: unknown): asserts value is GlobalSettings {
  schema(settingsValidator, value, "Settings");
  validateControls((value as GlobalSettings).controls);
}

function asset(path: string, kind?: "model" | "image"): void {
  if (isUserImageRef(path)) throw new Error(`Imported images can only dress arena texture slots: ${path}`);
  if (!resolveAsset(path)) throw new Error(`Missing bundled asset: ${path}`);
  if (kind === "model" && !/\.glb$/i.test(path)) throw new Error(`Expected a GLB: ${path}`);
  if (kind === "image" && !/\.(png|jpe?g|webp|gif|svg)$/i.test(path)) throw new Error(`Expected an image: ${path}`);
}

/**
 * `library` is the owning save's imported-image ids. Without one - bundled
 * files and repository authoring - an imported-image reference is invalid.
 */
export function validateArena(value: unknown, library: ReadonlySet<string> = new Set()): asserts value is ArenaData {
  schema(arenaValidator, value, "Arena");
  const arena = value as ArenaData;
  if (arena.id.length > 80 || arena.displayName.trim().length === 0 || arena.displayName.length > 160) throw new Error("Arena name/id is too long or blank.");
  if (arena.stage) {
    const stage = stageById(arena.stage);
    if (!stage) throw new Error(`Unknown stage: ${arena.stage}`);
    asset(stage.glb, "model");
    for (const kind of ["floor", "barricade", "outer"] as const) {
      const path = arena[kind];
      if (path && !pieceFitsStage(arena.stage, kind, path)) throw new Error(`${kind} does not fit stage ${arena.stage}.`);
      if (path) asset(path, "model");
    }
  } else {
    if (arena.arenaGlb) asset(arena.arenaGlb, "model");
    for (const part of arena.arenaParts ?? []) asset(typeof part === "string" ? part : part.glb, "model");
    if (!arena.arenaGlb && !arena.arenaParts?.length) throw new Error("Arena has no model parts.");
  }
  if (arena.previewImage) asset(arena.previewImage, "image");
  // The renderer would quietly fall back to the default ring; a save should
  // not carry a ring it cannot show.
  if (arena.ring) {
    if (!ringByGlb(arena.ring)) throw new Error(`Unknown ring: ${arena.ring}`);
    asset(arena.ring, "model");
  }
  for (const map of ["arenaTextures", "ringTextures"] as const) {
    for (const [key, value] of Object.entries(arena[map] ?? {})) {
      const slot = TEXTURE_SLOTS.find((s) => s.map === map && (s.materials.includes(key) || s.colors.some((c) => c.key === key)));
      const legacyColor = map === "ringTextures" && Object.hasOwn(LEGACY_COLOR_TARGETS, key);
      if (!slot && !legacyColor) throw new Error(`Unsupported texture slot: ${map}.${key}`);
      if (value == null) throw new Error(`Texture slot ${key} must have a value or be omitted.`);
      if (key.endsWith("Color")) {
        const check = ajv.getSchema(`${arenaSchema.$id}#/$defs/css_color`)!;
        schema(check, value, key);
      } else if (isUserImageRef(value)) {
        // Any texture slot may take an imported image; the folder rule is for bundled art.
        const id = userImageId(value);
        if (!id || !library.has(id)) throw new Error(`Texture slot ${key} uses an imported image that is not in this save.`);
      } else {
        asset(value, "image");
        if (!slot || !pathBelongsToSlot(slot, value)) throw new Error(`Texture does not belong to slot ${key}.`);
      }
    }
  }
}

export function validateRecovery(value: unknown, library: ReadonlySet<string> = new Set()): asserts value is ArenaRecovery {
  schema(recoveryValidator, value, "Recovery draft");
  const recovery = value as ArenaRecovery;
  // An unfinished identity is recoverable, but its renderable resources must be valid.
  const draft = recovery.draft;
  const arena: ArenaData = { ...copy(draft), id: "recovery", displayName: "Recovery" };
  if (!arena.previewImage) delete arena.previewImage;
  validateArena(arena, library);
  if (recovery.editingId !== null && recovery.editingId !== draft.id) throw new Error("Recovery identity differs from the edited arena.");
}

/** The save's imported-image ids, after checking its library against the limits. */
export function libraryIds(save: SaveRecord): Set<string> {
  const ids = new Set<string>();
  let bytes = 0;
  for (const image of save.images) {
    if (ids.has(image.id)) throw new Error("An imported image is listed twice in one save.");
    if (!image.name.trim()) throw new Error("An imported image needs a name.");
    if (image.width * image.height > LIMITS.imagePixels) throw new Error(`Imported image “${image.name}” exceeds 4 megapixels.`);
    ids.add(image.id);
    bytes += image.byteLength;
  }
  if (ids.size > LIMITS.images) throw new Error(`A save can hold at most ${LIMITS.images} imported images.`);
  if (bytes > LIMITS.libraryBytes) throw new Error("Imported images exceed 64 MiB in this save.");
  return ids;
}

export function validateSave(value: unknown): asserts value is SaveRecord {
  schema(saveValidator, value, "Save");
  const save = value as SaveRecord;
  if (!save.name.trim()) throw new Error("A save name is required.");
  const library = libraryIds(save);
  const ids = new Set(bundledArenaIds());
  for (const arena of save.arenas) {
    validateArena(arena, library);
    if (ids.has(arena.id)) throw new Error(`Arena id collision: ${arena.id}`);
    ids.add(arena.id);
  }
  for (const recovery of save.drafts) {
    validateRecovery(recovery, library);
    if (recovery.editingId && !save.arenas.some((arena) => arena.id === recovery.editingId)) throw new Error("Recovery references an arena outside this save.");
  }
}

export function validateWorkspace(value: unknown): asserts value is Workspace {
  schema(workspaceValidator, value, "Local save data");
  const workspace = value as Workspace;
  validateSettings(workspace.settings);
  const ids = new Set<string>();
  const images = new Map<string, ImageInfo>();
  for (const save of workspace.saves) {
    validateSave(save);
    if (ids.has(save.id)) throw new Error("Duplicate local save id.");
    ids.add(save.id);
    // Saves share one record per id, so they must agree on what its bytes are.
    for (const image of save.images) {
      const known = images.get(image.id);
      if (known && (known.mime !== image.mime || known.width !== image.width || known.height !== image.height || known.byteLength !== image.byteLength)) {
        throw new Error("Saves disagree about a shared imported image.");
      }
      images.set(image.id, image);
    }
  }
  if (!ids.has(workspace.activeSaveId)) throw new Error("Selected save does not exist.");
}

/** Only for migration: the frozen shape local databases held before imported images. */
export function validateWorkspaceV1(value: unknown): void {
  schema(workspaceV1Validator, value, "Local save data (v1)");
}

export function validateManifest(value: unknown): asserts value is BackupManifest {
  schema(manifestValidator, value, "Unsupported or invalid backup manifest");
}

/** Version 1 backups predate imported images; the archive decoder migrates them. */
export function validateManifestV1(value: unknown): void {
  schema(manifestV1Validator, value, "Unsupported or invalid backup manifest");
}
