import { PadControl, controlForBinding } from "../data/controls";

/**
 * The virtual controller the menus consume.
 *
 * Menus never look at physical inputs. A key, mouse button, gamepad button or
 * stick direction becomes a pad control via the bindings, and the pad control
 * becomes a virtual input here, so rebinding an input in the mapper changes
 * menu navigation too without any screen knowing about it.
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

/**
 * The binding a mouse button press is stored as, `mouse:<button>`.
 *
 * Touch and pen are left out: a tap is a click on whatever is under it, and
 * binding it to a pad button would turn every tap on the page into input.
 */
export function bindingForPointer(event: PointerEvent): string | null {
  if (event.pointerType !== "mouse" || event.button < 0 || event.button > 4) {
    return null;
  }
  return `mouse:${event.button}`;
}

/**
 * Whether a click landed on something that handles clicks itself.
 *
 * Mapped mouse buttons are for clicking on empty space; a click on a button,
 * field or menu row should do what clicking that element does, not also fire
 * whatever pad control Left Mouse is bound to.
 */
export function isInteractivePointerTarget(event: PointerEvent): boolean {
  return event.target instanceof Element && Boolean(
    event.target.closest("button, input, select, textarea, a, .item, .row")
  );
}

/** The virtual input a stored binding stands for, if any. */
export function virtualInputForBinding(binding: string): VirtualInput | null {
  const control = controlForBinding(binding);
  return control ? VIRTUAL_BY_CONTROL[control] : null;
}

/**
 * The virtual input a keyboard or mouse event stands for, if any.
 *
 * Escape always backs out. Once B is rebound away from it there would
 * otherwise be no keyboard back on any screen, so an unbound Escape still
 * reads as B. A bound Escape does whatever it is bound to.
 */
export function virtualInputFor(event: KeyboardEvent | PointerEvent): VirtualInput | null {
  if ("code" in event) {
    const code = eventCode(event);
    return virtualInputForBinding(code) ?? (code === "Escape" ? "b" : null);
  }
  const binding = bindingForPointer(event);
  return binding ? virtualInputForBinding(binding) : null;
}

/**
 * Reports gamepad presses as bindings, once per press.
 *
 * The Gamepad API has no events for buttons, so this polls every frame and
 * calls back on the frame a button goes down or a stick crosses the
 * threshold - holding it does not repeat. Returns the function that stops it.
 */
export function pollGamepadBindings(onBinding: (binding: string) => void): () => void {
  let previous = new Set<string>();
  let frame = 0;

  const poll = () => {
    const active = new Set<string>();
    for (const gamepad of navigator.getGamepads?.() ?? []) {
      if (!gamepad?.connected) continue;
      gamepad.buttons.forEach((button, index) => {
        if (!button.pressed && button.value < 0.5) return;
        const binding = `gamepad:button:${index}`;
        active.add(binding);
        if (!previous.has(binding)) onBinding(binding);
      });
      gamepad.axes.forEach((value, index) => {
        // Past half-way, so a resting stick's drift never reads as a press.
        if (Math.abs(value) < 0.55) return;
        const direction = value > 0 ? "positive" : "negative";
        const binding = `gamepad:axis:${index}:${direction}`;
        active.add(binding);
        if (!previous.has(binding)) onBinding(binding);
      });
    }
    previous = active;
    frame = requestAnimationFrame(poll);
  };

  frame = requestAnimationFrame(poll);
  return () => cancelAnimationFrame(frame);
}

/** Whether an input moves a menu cursor up, from either stick or d-pad. */
export function isMenuUp(input: VirtualInput): boolean {
  return input === "up" || input === "stickUp";
}

/** Whether an input moves a menu cursor down, from either stick or d-pad. */
export function isMenuDown(input: VirtualInput): boolean {
  return input === "down" || input === "stickDown";
}
