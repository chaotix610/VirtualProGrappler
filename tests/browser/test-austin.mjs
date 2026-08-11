/**
 * Drives the combat test with Austin, the first bespoke low-poly character.
 *
 * Two things here cannot be checked from the GLB alone, because they are
 * questions about what Babylon did with it rather than what the file says:
 *
 *  - the material resolves to an *unlit* PBRMaterial, so the shading painted
 *    into the texture is not lit a second time by the scene;
 *  - the export flags really are gone, i.e. back-face culling is on and the
 *    material is opaque rather than alpha-tested.
 *
 * The lights-off screenshot is the proof of the first: with every light at
 * zero intensity the ring and the opponent go black, and an unlit character
 * does not change at all.
 *
 *   npm run dev
 *   node tests/browser/test-austin.mjs
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const URL = process.env.GAME_URL || "http://localhost:8080/#combat";
const OUT = process.env.OUT_DIR || "/tmp/vpg-shots";
mkdirSync(OUT, { recursive: true });

const errors = [];
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

const roster = await page.$$eval(".roster__name", (els) =>
  els.map((e) => e.textContent.trim())
);
console.log("ROSTER:", roster.join(", "));

await page.click('.roster__card:has(.roster__name:text-is("Austin"))');

// Austin has no clips yet, so `currentAnimation` never leaves null and the
// usual wait would hang. Wait on his geometry reaching the scene instead.
await page.waitForFunction(
  () => (window.__game?.scene?.meshes ?? []).some((m) => m.name === "head"),
  { timeout: 60000 }
);
await page.waitForTimeout(2500);

const report = await page.evaluate(() => {
  const scene = window.__game.scene;
  const material = scene.materials.find((m) => m.name === "mat_character");
  return {
    found: Boolean(material),
    unlit: material?.unlit,
    backFaceCulling: material?.backFaceCulling,
    // 0 is OPAQUE; 1 would be the ALPHATEST the export shipped with.
    transparencyMode: material?.transparencyMode,
    missingClips: document.querySelector(".hud__warning")?.textContent?.trim() ?? null,
  };
});

console.log(JSON.stringify(report, null, 2));
await page.screenshot({ path: `${OUT}/austin-unlit.png` });

await page.evaluate(() => {
  window.__game.scene.lights.forEach((l) => (l.intensity = 0));
});
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/austin-lights-off.png` });

const failures = [];
if (!report.found) failures.push("mat_character was not in the scene");
if (report.unlit !== true) failures.push(`expected unlit, got ${report.unlit}`);
if (report.backFaceCulling !== true) failures.push("back-face culling is off");
if (report.transparencyMode !== 0) {
  failures.push(`expected opaque, got transparencyMode ${report.transparencyMode}`);
}

console.log("SHOTS:", OUT);
console.log("ERRORS:", errors.length ? errors.join("\n") : "none");
console.log(failures.length ? `FAIL: ${failures.join("; ")}` : "PASS");

await browser.close();
process.exit(failures.length || errors.length ? 1 : 0);
