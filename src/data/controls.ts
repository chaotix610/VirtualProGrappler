import mappingJson from "#data/settings/control-mappings.json";

/**
 * Controller bindings.
 *
 * The move slots are written against an N64 pad, so the engine reasons in
 * those terms and this is the only place that knows about keyboard codes.
 *
 * Defaults come from data/settings/control-mappings.json. The player may
 * rebind on top of them in the control mapper, and those overrides persist to
 * localStorage. Saved bindings are merged *over* the defaults rather than
 * replacing them, so a control added to the JSON later still arrives bound
 * for players who already have a save.
 */

/** Every control the slot definitions can reference. */
export type PadButton =
  | "a"
  | "b"
  | "z"
  | "l"
  | "r"
  | "start"
  | "cUp"
  | "cDown"
  | "cLeft"
  | "cRight";

export type PadDirection =
  | "dpadUp"
  | "dpadDown"
  | "dpadLeft"
  | "dpadRight"
  | "controlStickUp"
  | "controlStickDown"
  | "controlStickLeft"
  | "controlStickRight";

export type PadControl = PadButton | PadDirection;

export interface ControlMapping {
  version: string;
  profile: string;
  bindings: Record<PadControl, string[]>;
}

/** Canonical control order, used by the mapper UI and by `unboundControls`. */
export const PAD_CONTROLS: readonly PadControl[] = [
  "dpadUp",
  "dpadDown",
  "dpadLeft",
  "dpadRight",
  "controlStickUp",
  "controlStickDown",
  "controlStickLeft",
  "controlStickRight",
  "cUp",
  "cDown",
  "cLeft",
  "cRight",
  "a",
  "b",
  "z",
  "start",
  "l",
  "r",
] as const;

/** Labels for the mapper rows. */
export const PAD_CONTROL_LABELS: Record<PadControl, string> = {
  dpadUp: "D-Pad Up",
  dpadDown: "D-Pad Down",
  dpadLeft: "D-Pad Left",
  dpadRight: "D-Pad Right",
  controlStickUp: "Control Stick Up",
  controlStickDown: "Control Stick Down",
  controlStickLeft: "Control Stick Left",
  controlStickRight: "Control Stick Right",
  cUp: "C-Up",
  cDown: "C-Down",
  cLeft: "C-Left",
  cRight: "C-Right",
  a: "A",
  b: "B",
  z: "Z",
  start: "Start",
  l: "L",
  r: "R",
};

export const STORAGE_KEY = "vpg-control-mappings";

const defaults = mappingJson as ControlMapping;

const cloneBindings = (
  bindings: Record<PadControl, string[]>
): Record<PadControl, string[]> => {
  const copy = {} as Record<PadControl, string[]>;
  for (const control of PAD_CONTROLS) {
    copy[control] = [...(bindings[control] ?? [])];
  }
  return copy;
};

/**
 * Live mapping. `bindings` is mutated in place by rebinding, so anything
 * holding a reference to CONTROL_MAPPING keeps seeing current values.
 */
export const CONTROL_MAPPING: ControlMapping = {
  version: defaults.version,
  profile: defaults.profile,
  bindings: cloneBindings(defaults.bindings),
};

/** Reverse index: KeyboardEvent.code -> the pad control it stands for. */
let byKeyCode = new Map<string, PadControl>();

function reindex(): void {
  byKeyCode = new Map();
  for (const control of PAD_CONTROLS) {
    for (const code of CONTROL_MAPPING.bindings[control]) {
      byKeyCode.set(code, control);
    }
  }
}
reindex();

/** Which pad control a physical key stands for, if any. */
export function controlForKey(code: string): PadControl | null {
  return byKeyCode.get(code) ?? null;
}

/** Keys currently bound to a pad control. */
export function keysForControl(control: PadControl): readonly string[] {
  return CONTROL_MAPPING.bindings[control] ?? [];
}

/** Every control that has no key bound to it. */
export function unboundControls(): PadControl[] {
  return PAD_CONTROLS.filter((c) => keysForControl(c).length === 0);
}

/** The mapping as it would be written to disk. */
export function exportMapping(): ControlMapping {
  return {
    version: CONTROL_MAPPING.version,
    profile: CONTROL_MAPPING.profile,
    bindings: cloneBindings(CONTROL_MAPPING.bindings),
  };
}

export interface RebindResult {
  /** The control the key was taken from, when it was already in use. */
  displaced: PadControl | null;
}

/**
 * Binds a key to a control, as the single key for that control.
 *
 * A key stands for exactly one control, so binding a key already in use
 * removes it from wherever it was. The caller is expected to have confirmed
 * that with the player first - `conflictFor` reports it ahead of time.
 */
export function bindKey(control: PadControl, code: string): RebindResult {
  const displaced = controlForKey(code);
  if (displaced === control) {
    // Already this control's key. Still collapses to a single binding, which
    // is a real change when the control had several, so it is saved too.
    CONTROL_MAPPING.bindings[control] = [code];
    reindex();
    save();
    return { displaced: null };
  }

  if (displaced) {
    CONTROL_MAPPING.bindings[displaced] = CONTROL_MAPPING.bindings[
      displaced
    ].filter((c) => c !== code);
  }
  CONTROL_MAPPING.bindings[control] = [code];
  reindex();
  save();
  return { displaced };
}

/** Which control already owns a key, when binding it would take it away. */
export function conflictFor(
  control: PadControl,
  code: string
): PadControl | null {
  const owner = controlForKey(code);
  return owner && owner !== control ? owner : null;
}

/** Restores the bindings shipped in the JSON and clears the save. */
export function resetBindings(): void {
  CONTROL_MAPPING.bindings = cloneBindings(defaults.bindings);
  reindex();
  if (storage()) storage()!.removeItem(STORAGE_KEY);
}

function storage(): Storage | null {
  // Absent under the unit suite, and can throw when cookies are blocked.
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function save(): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(exportMapping()));
  } catch {
    // A full or blocked quota should not break the mapper.
  }
}

/**
 * Applies any saved bindings over the defaults.
 *
 * Called once at startup. Unknown controls and non-string keys in the save are
 * dropped rather than trusted, since it is user-editable storage.
 */
export function loadSavedBindings(): void {
  const store = storage();
  if (!store) return;

  let saved: unknown;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return;
    saved = JSON.parse(raw);
  } catch {
    return;
  }

  const bindings = (saved as Partial<ControlMapping> | null)?.bindings;
  if (!bindings || typeof bindings !== "object") return;

  for (const control of PAD_CONTROLS) {
    const codes = (bindings as Record<string, unknown>)[control];
    // Presence in the save is what decides, not whether it has keys. A control
    // saved as empty was deliberately unbound - restoring its default would
    // both undo that and, if the player moved its key elsewhere, hand the same
    // key to two controls. A control missing entirely is one added to the JSON
    // since the save was written, and keeps its default.
    if (!Array.isArray(codes)) continue;
    CONTROL_MAPPING.bindings[control] = codes.filter(
      (c): c is string => typeof c === "string"
    );
  }
  reindex();
}
