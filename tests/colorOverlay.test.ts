import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cssColorToRgb, cssColorToRgba } from "@/renderer/cssColor";
import { colorBlend, colorTargets } from "@/data/textureSlots";

describe("colour strength", () => {
  it("reads the alpha the editor's Strength slider writes", () => {
    expect(cssColorToRgba("rgba(255, 0, 0, 0.4)")).toEqual({ r: 1, g: 0, b: 0, a: 0.4 });
    expect(cssColorToRgba("rgba(255, 0, 0, 1)")?.a).toBe(1);
    expect(cssColorToRgba("rgba(0, 0, 0, 0)")?.a).toBe(0);
  });

  it("counts a colour with no alpha as full strength", () => {
    expect(cssColorToRgba("#ff0000")?.a).toBe(1);
    expect(cssColorToRgba("rgb(255, 0, 0)")?.a).toBe(1);
  });

  it("refuses an alpha outside 0-1 rather than clamping a typo", () => {
    expect(cssColorToRgba("rgba(255, 0, 0, 1.5)")).toBeNull();
  });

  it("still gives multiply colours their channels without the alpha", () => {
    expect(cssColorToRgb("rgba(255, 0, 0, 0.4)")).toEqual({ r: 1, g: 0, b: 0 });
  });
});

describe("turnbuckle pad colour", () => {
  it("overlays rather than multiplies, so a dark baked pad can still turn red", () => {
    expect(colorBlend("turnbucklePadColor")).toBe("overlay");
  });

  it("reaches the pads on both rings", () => {
    expect(colorTargets("turnbucklePadColor")).toEqual(["mat_turnbuckle", "mat_pad"]);
  });

  it("leaves the other colours multiplying as before", () => {
    for (const key of ["canvasColor", "apronColor", "ropeTopColor", "postColor", "barricadeColor"]) {
      expect(colorBlend(key), key).toBe("multiply");
    }
  });
});

describe("the overlay's shader hook", () => {
  it("still exists in the installed Babylon PBR shader, right after the albedo is built", async () => {
    // Babylon renames these hooks between versions; this catches an upgrade
    // that would silently drop the overlay.
    const { OVERLAY_SHADER_HOOK } = await import("@/renderer/colorOverlay");
    const shader = readFileSync(
      "node_modules/@babylonjs/core/Shaders/pbr.fragment.js",
      "utf8"
    ).replace(/\\n/g, "\n");
    const albedo = shader.indexOf("vec3 surfaceAlbedo=");
    const hook = shader.indexOf(`#define ${OVERLAY_SHADER_HOOK}`);
    expect(albedo).toBeGreaterThan(-1);
    expect(hook).toBeGreaterThan(albedo);
    expect(shader.slice(albedo, hook)).not.toContain("lightingInfo");
  });
});
