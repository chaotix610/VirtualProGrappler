import mappingJson from "#data/settings/control-mappings.json";

/**
 * Controller bindings.
 *
 * The move slots are written against an N64 pad, so the engine reasons in
 * those terms and this is the only place that knows about physical inputs:
 * keyboard codes, `mouse:<button>`, `gamepad:button:<n>` and
 * `gamepad:axis:<n>:<positive|negative>`.
 *
 * Defaults come from data/settings/control-mappings.json. The player may
 * rebind on top of them in the control mapper, and the overrides persist to
 * localStorage - or, once something registers with setMappingPersistence, to
 * that instead. Saved bindings are merged *over* the defaults rather than
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

export type InputBinding = string;

export interface ControlMapping {
  version: string;
  profile: string;
  bindings: Record<PadControl, InputBinding[]>;
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

let persist: ((mapping: ControlMapping) => void) | null = null;

/** Startup hydration must not enqueue another save. */
export function applyMapping(mapping: ControlMapping): void {
  CONTROL_MAPPING.version = mapping.version;
  CONTROL_MAPPING.profile = mapping.profile;
  CONTROL_MAPPING.bindings = cloneBindings(mapping.bindings);
  reindex();
}

export function defaultMapping(): ControlMapping {
  return { version: defaults.version, profile: defaults.profile, bindings: cloneBindings(defaults.bindings) };
}

export function setMappingPersistence(callback: ((mapping: ControlMapping) => void) | null): void {
  persist = callback;
}

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
let byBinding = new Map<InputBinding, PadControl>();

function reindex(): void {
  byBinding = new Map();
  for (const control of PAD_CONTROLS) {
    for (const binding of CONTROL_MAPPING.bindings[control]) {
      byBinding.set(binding, control);
    }
  }
}
reindex();

/** Which pad control an input binding stands for, if any. */
export function controlForBinding(binding: InputBinding): PadControl | null {
  return byBinding.get(binding) ?? null;
}

/** Backwards-compatible lookup for saved keyboard-code bindings. */
export function controlForKey(code: string): PadControl | null {
  return controlForBinding(code);
}

/** Inputs currently bound to a pad control. */
export function keysForControl(control: PadControl): readonly InputBinding[] {
  return CONTROL_MAPPING.bindings[control] ?? [];
}

/** Turns a KeyboardEvent.code into something readable on screen. */
export function describeKey(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Arrow")) return `${code.slice(5)} Arrow`;
  return code;
}

/** Human-readable label for keyboard, mouse, and gamepad bindings. */
export function describeBinding(binding: InputBinding): string {
  const mouse = binding.match(/^mouse:(\d+)$/);
  if (mouse) {
    const names = ["Left Mouse", "Middle Mouse", "Right Mouse", "Mouse Back", "Mouse Forward"];
    return names[Number(mouse[1])] ?? `Mouse Button ${Number(mouse[1]) + 1}`;
  }

  const gamepadButton = binding.match(/^gamepad:button:(\d+)$/);
  if (gamepadButton) return `Gamepad Button ${Number(gamepadButton[1]) + 1}`;

  const gamepadAxis = binding.match(/^gamepad:axis:(\d+):(positive|negative)$/);
  if (gamepadAxis) {
    const direction = gamepadAxis[2] === "positive" ? "+" : "-";
    return `Gamepad Stick ${Number(gamepadAxis[1]) + 1} ${direction}`;
  }

  return describeKey(binding);
}

/** The keys bound to a control, as on-screen text, or "unbound". */
export function describeControl(control: PadControl): string {
  const keys = keysForControl(control);
  return keys.length ? keys.map(describeKey).join(", ") : "unbound";
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
export function bindInput(control: PadControl, binding: InputBinding): RebindResult {
  const displaced = controlForBinding(binding);
  if (displaced === control) {
    // Already this control's input. Still collapses to a single binding, which
    // is a real change when the control had several, so it is saved too.
    CONTROL_MAPPING.bindings[control] = [binding];
    reindex();
    save();
    return { displaced: null };
  }

  if (displaced) {
    CONTROL_MAPPING.bindings[displaced] = CONTROL_MAPPING.bindings[
      displaced
    ].filter((value) => value !== binding);
  }
  CONTROL_MAPPING.bindings[control] = [binding];
  reindex();
  save();
  return { displaced };
}

/** Backwards-compatible name for callers that bind keyboard keys. */
export function bindKey(control: PadControl, code: string): RebindResult {
  return bindInput(control, code);
}

/** Which control already owns a key, when binding it would take it away. */
export function conflictForBinding(
  control: PadControl,
  binding: InputBinding
): PadControl | null {
  const owner = controlForBinding(binding);
  return owner && owner !== control ? owner : null;
}

/** Backwards-compatible name for keyboard-code conflicts. */
export function conflictFor(control: PadControl, code: string): PadControl | null {
  return conflictForBinding(control, code);
}

/** Restores the bindings shipped in the JSON and clears the save. */
export function resetBindings(): void {
  applyMapping(defaultMapping());
  if (persist) return persist(exportMapping());
  try { storage()?.removeItem(STORAGE_KEY); } catch { /* Legacy storage may be blocked. */ }
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
  if (persist) return persist(exportMapping());
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
    const inputs = (bindings as Record<string, unknown>)[control];
    // Presence in the save is what decides, not whether it has keys. A control
    // saved as empty was deliberately unbound - restoring its default would
    // both undo that and, if the player moved its key elsewhere, hand the same
    // key to two controls. A control missing entirely is one added to the JSON
    // since the save was written, and keeps its default.
    if (!Array.isArray(inputs)) continue;
    CONTROL_MAPPING.bindings[control] = inputs.filter(
      (input): input is InputBinding => typeof input === "string"
    );
  }
  reindex();
}
