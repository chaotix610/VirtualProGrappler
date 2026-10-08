import { afterEach, describe, expect, it } from "vitest";
import {
  MAIN_MENU,
  ROOT_PAGE,
  pageByKey,
  resolveTarget,
} from "@/data/mainMenu";
import {
  CONTROL_MAPPING,
  PAD_CONTROLS,
  STORAGE_KEY,
  bindKey,
  conflictFor,
  controlForKey,
  exportMapping,
  keysForControl,
  loadSavedBindings,
  resetBindings,
  unboundControls,
} from "@/data/controls";
import { virtualInputFor } from "@/game/VirtualController";

const keyEvent = (code: string) => ({ code, key: code }) as KeyboardEvent;

describe("main menu data", () => {
  it("starts on a page that exists", () => {
    expect(pageByKey(ROOT_PAGE)).not.toBeNull();
  });

  it("offers exactly the three root options", () => {
    const root = pageByKey(ROOT_PAGE)!;
    expect(root.menuItems.map((i) => i.displayName)).toEqual([
      "Multi Play",
      "Single Play",
      "Commissioner",
    ]);
  });

  it("routes the three root options to real pages", () => {
    const root = pageByKey(ROOT_PAGE)!;
    for (const item of root.menuItems) {
      expect(resolveTarget(item.target), item.id).toEqual({
        kind: "page",
        key: item.target,
      });
    }
  });

  it("reaches Combat System Test through Commissioner and Smackdown Mall", () => {
    const commissioner = pageByKey("commissioner")!;
    const mallItem = commissioner.menuItems.find(
      (i) => i.displayName === "Smackdown Mall"
    );
    expect(mallItem).toBeDefined();

    const target = resolveTarget(mallItem!.target);
    expect(target).toEqual({ kind: "page", key: "smackdownMall" });

    const mall = pageByKey("smackdownMall")!;
    const test = mall.menuItems.find(
      (i) => i.displayName === "Combat System Test"
    );
    expect(test).toBeDefined();
    expect(resolveTarget(test!.target)).toEqual({
      kind: "route",
      id: "test.combat_system",
    });
  });

  it("keeps the controls screen on a route the menu handles", () => {
    const commissioner = pageByKey("commissioner")!;
    const controls = commissioner.menuItems.find((i) => i.id === "controls")!;
    expect(resolveTarget(controls.target)).toEqual({
      kind: "route",
      id: "commissioner.controls",
    });
  });

  it("gives every item instructions to show", () => {
    const empty: string[] = [];
    for (const [key, page] of Object.entries(MAIN_MENU.pages)) {
      for (const item of page.menuItems) {
        if (!item.instructions?.blocks?.length) empty.push(`${key}.${item.id}`);
      }
    }
    expect(empty).toEqual([]);
  });
});

describe("virtual controller", () => {
  afterEach(() => resetBindings());

  it("turns bound keys into virtual inputs", () => {
    expect(virtualInputFor(keyEvent("Enter"))).toBe("a");
    expect(virtualInputFor(keyEvent("Escape"))).toBe("b");
    expect(virtualInputFor(keyEvent("ArrowUp"))).toBe("up");
    expect(virtualInputFor(keyEvent("KeyW"))).toBe("stickUp");
    expect(virtualInputFor(keyEvent("KeyZ"))).toBe("z");
  });

  it("ignores unbound keys", () => {
    expect(virtualInputFor(keyEvent("F13"))).toBeNull();
  });

  it("follows a rebind", () => {
    bindKey("a", "KeyX");
    expect(virtualInputFor(keyEvent("KeyX"))).toBe("a");
    expect(virtualInputFor(keyEvent("Enter"))).toBeNull();
  });
});

describe("rebinding", () => {
  afterEach(() => resetBindings());

  it("reports a conflict before taking a key", () => {
    // Enter is A by default.
    expect(conflictFor("z", "Enter")).toBe("a");
    expect(conflictFor("a", "Enter")).toBeNull();
    expect(conflictFor("z", "F13")).toBeNull();
  });

  it("moves a key off the control that had it", () => {
    const { displaced } = bindKey("z", "Enter");
    expect(displaced).toBe("a");
    expect(controlForKey("Enter")).toBe("z");
    expect(keysForControl("a")).toEqual([]);
  });

  it("rebinding a control to its own key changes nothing", () => {
    const { displaced } = bindKey("a", "Enter");
    expect(displaced).toBeNull();
    expect(controlForKey("Enter")).toBe("a");
  });

  it("restores defaults on reset", () => {
    bindKey("a", "KeyX");
    bindKey("b", "KeyY");
    resetBindings();
    expect(controlForKey("Enter")).toBe("a");
    expect(controlForKey("Escape")).toBe("b");
    expect(unboundControls()).toEqual([]);
  });

  it("exports a copy, not the live mapping", () => {
    const exported = exportMapping();
    exported.bindings.a = ["KeyQ"];
    expect(CONTROL_MAPPING.bindings.a).toEqual(["Enter"]);
  });

  it("exports every control in the shape the mapper file uses", () => {
    const exported = exportMapping();
    expect(Object.keys(exported).sort()).toEqual([
      "bindings",
      "profile",
      "version",
    ]);
    expect(Object.keys(exported.bindings).sort()).toEqual(
      [...PAD_CONTROLS].sort()
    );
  });
});

describe("loading a save", () => {
  /** Minimal localStorage, since the unit suite runs without a DOM. */
  function stubStorage(contents: Record<string, string>) {
    const store = new Map(Object.entries(contents));
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as Storage;
  }

  const savedAs = (bindings: Record<string, string[]>) => ({
    [STORAGE_KEY]: JSON.stringify({
      version: "1.0.0",
      profile: "default",
      bindings,
    }),
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    resetBindings();
  });

  it("applies saved bindings over the defaults", () => {
    stubStorage(savedAs({ a: ["KeyX"] }));
    loadSavedBindings();
    expect(controlForKey("KeyX")).toBe("a");
  });

  it("keeps defaults for controls the save does not mention", () => {
    stubStorage(savedAs({ a: ["KeyX"] }));
    loadSavedBindings();
    // `b` was absent from the save, so it keeps the shipped Escape.
    expect(controlForKey("Escape")).toBe("b");
  });

  it("respects a control the player deliberately unbound", () => {
    // The player moved L's key onto Z, leaving L empty. Restoring L's default
    // would give KeyQ to both, so an empty entry has to be honoured.
    stubStorage(savedAs({ l: [], z: ["KeyQ"] }));
    loadSavedBindings();
    expect(keysForControl("l")).toEqual([]);
    expect(controlForKey("KeyQ")).toBe("z");
  });

  it("ignores a corrupt save rather than throwing", () => {
    stubStorage({ [STORAGE_KEY]: "{not json" });
    expect(() => loadSavedBindings()).not.toThrow();
    expect(controlForKey("Enter")).toBe("a");
  });

  it("drops non-string keys from a hand-edited save", () => {
    stubStorage(savedAs({ a: ["KeyX", 42 as unknown as string] }));
    loadSavedBindings();
    expect(keysForControl("a")).toEqual(["KeyX"]);
  });
});
