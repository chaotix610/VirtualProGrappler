import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bindInput,
  conflictForBinding,
  controlForBinding,
  describeBinding,
  exportMapping,
  keysForControl,
  loadSavedBindings,
  resetBindings,
  STORAGE_KEY,
} from "@/data/controls";
import {
  bindingForPointer,
  virtualInputFor,
  virtualInputForBinding,
} from "@/game/VirtualController";

describe("controller bindings beyond the keyboard", () => {
  let saved: Map<string, string>;

  beforeEach(() => {
    saved = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
      removeItem: (key: string) => saved.delete(key),
    });
    resetBindings();
  });

  it("moves an occupied binding and updates virtual navigation", () => {
    expect(conflictForBinding("a", "ArrowUp")).toBe("dpadUp");
    expect(bindInput("a", "ArrowUp").displaced).toBe("dpadUp");
    expect(keysForControl("dpadUp")).toEqual([]);
    expect(controlForBinding("Enter")).toBeNull();
    expect(virtualInputForBinding("ArrowUp")).toBe("a");
    expect(JSON.parse(saved.get(STORAGE_KEY)!).bindings.a).toEqual(["ArrowUp"]);
  });

  it.each(["mouse:0", "gamepad:button:2", "gamepad:axis:1:negative"])(
    "routes a rebound %s input",
    (binding) => {
      bindInput("dpadUp", binding);
      expect(virtualInputForBinding(binding)).toBe("up");
    }
  );

  it("reads a mouse press as its button, and leaves touch and pen alone", () => {
    const press = (pointerType: string, button: number) =>
      ({ pointerType, button }) as PointerEvent;
    expect(bindingForPointer(press("mouse", 2))).toBe("mouse:2");
    expect(bindingForPointer(press("touch", 0))).toBeNull();
    expect(bindingForPointer(press("pen", 0))).toBeNull();
  });

  it("keeps an unbound Escape as back, and lets a bound one do its job", () => {
    bindInput("b", "KeyX");
    expect(virtualInputFor({ code: "Escape", key: "Escape" } as KeyboardEvent)).toBe("b");
    expect(virtualInputForBinding("KeyX")).toBe("b");

    bindInput("start", "Escape");
    expect(virtualInputFor({ code: "Escape", key: "Escape" } as KeyboardEvent)).toBe("start");
  });

  it("names every kind of binding for the hints", () => {
    expect(describeBinding("mouse:0")).toBe("Left Mouse");
    expect(describeBinding("mouse:4")).toBe("Mouse Forward");
    expect(describeBinding("gamepad:button:0")).toBe("Gamepad Button 1");
    expect(describeBinding("gamepad:axis:1:negative")).toBe("Gamepad Stick 2 -");
  });

  it("loads partial saves while preserving deliberate unbinding and new defaults", () => {
    saved.set(
      STORAGE_KEY,
      JSON.stringify({ bindings: { a: ["mouse:0", 42], b: [], unknownControl: ["KeyV"] } })
    );
    loadSavedBindings();
    expect(keysForControl("a")).toEqual(["mouse:0"]);
    expect(keysForControl("b")).toEqual([]);
    expect(keysForControl("dpadUp")).toEqual(["ArrowUp"]);
    expect(controlForBinding("KeyV")).toBeNull();
  });

  it("ignores malformed saved JSON", () => {
    const defaults = exportMapping();
    saved.set(STORAGE_KEY, "{broken");
    expect(() => loadSavedBindings()).not.toThrow();
    expect(exportMapping()).toEqual(defaults);
  });

  it("restores defaults and clears saved overrides", () => {
    bindInput("a", "mouse:0");
    resetBindings();
    expect(virtualInputForBinding("Enter")).toBe("a");
    expect(virtualInputForBinding("mouse:0")).toBeNull();
    expect(saved.has(STORAGE_KEY)).toBe(false);
  });
});
