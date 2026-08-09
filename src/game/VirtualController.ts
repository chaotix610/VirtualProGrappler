import { PadControl, controlForKey } from "../data/controls";

/**
 * The virtual controller the menus consume.
 *
 * Menus never look at key names. A keyboard event becomes a pad control via
 * the bindings, and the pad control becomes a virtual input here, so rebinding
 * a key in the mapper changes menu navigation too without any screen knowing
 * about it.
 */

export type VirtualInput =
  | "up"
  | "down"
  | "left"
  | "right"
  | "stickUp"
  | "stickDown"
  | "stickLeft"
  | "stickRight"
  | "a"
  | "b"
  | "z"
  | "start"
  | "l"
  | "r"
  | "cUp"
  | "cDown"
  | "cLeft"
  | "cRight";

const VIRTUAL_BY_CONTROL: Record<PadControl, VirtualInput> = {
  dpadUp: "up",
  dpadDown: "down",
  dpadLeft: "left",
  dpadRight: "right",
  controlStickUp: "stickUp",
  controlStickDown: "stickDown",
  controlStickLeft: "stickLeft",
  controlStickRight: "stickRight",
  a: "a",
  b: "b",
  z: "z",
  start: "start",
  l: "l",
  r: "r",
  cUp: "cUp",
  cDown: "cDown",
  cLeft: "cLeft",
  cRight: "cRight",
};

/**
 * The identifier a keyboard event is bound by.
 *
 * `code` is the physical key and is what the bindings store; `key` is the
 * fallback for events that carry no code.
 */
export function eventCode(event: KeyboardEvent): string {
  return event.code || event.key;
}

/** The virtual input a keyboard event stands for, if any. */
export function virtualInputFor(event: KeyboardEvent): VirtualInput | null {
  const control = controlForKey(eventCode(event));
  return control ? VIRTUAL_BY_CONTROL[control] : null;
}

/** Whether an input moves a menu cursor up, from either stick or d-pad. */
export function isMenuUp(input: VirtualInput): boolean {
  return input === "up" || input === "stickUp";
}

/** Whether an input moves a menu cursor down, from either stick or d-pad. */
export function isMenuDown(input: VirtualInput): boolean {
  return input === "down" || input === "stickDown";
}
