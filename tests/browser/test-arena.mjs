import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

/**
 * Drives the Arena Viewer against the acceptance criteria in
 * claude-arena-viewer.md: selection, preview, load, textures, camera, close.
 *
 * Navigation goes through real key events so the virtual controller layer is
 * exercised rather than bypassed.
 */

const URL = process.env.GAME_URL || "http://localhost:8080/";
const OUT = process.env.OUT_DIR || "./arena-shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

const results = [];
const check = (n, p, d = "") => {
  results.push({ n, p });
  console.log(`${p ? "PASS" : "FAIL"}  ${n}${d ? `\n        ${d}` : ""}`);
};

const press = async (key, settle = 140) => {
  await page.keyboard.press(key);
  await page.waitForTimeout(settle);
};
const rows = () => page.$$eval(".row", (els) => els.map((e) => e.textContent.trim()));
const activeRow = () =>
  page.$eval(".row--active", (e) => e.textContent.trim()).catch(() => null);

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForSelector(".item", { timeout: 30000 });
await page.waitForTimeout(400);

// Commissioner -> Arena Viewer.
await press("ArrowDown");
await press("ArrowDown");
await press("Enter");
await press("ArrowDown");
await press("ArrowDown");
check("cursor reaches Arena Viewer", (await activeRow()) === null, "");
await page.$eval(".item--active", (e) => e.textContent.trim()).then((t) =>
  check("Arena Viewer is highlighted", t === "Arena Viewer", t)
);
await press("Enter");
await page.waitForSelector(".viewer", { timeout: 10000 });

// --- selection list --------------------------------------------------------
const listed = await rows();
check(
  "lists all ten arenas plus Back",
  listed.length === 11 && listed[listed.length - 1] === "Back",
  `${listed.length} rows: ${listed.join(", ")}`
);

const sorted = [...listed.slice(0, -1)].sort((a, b) => a.localeCompare(b));
check(
  "arenas are sorted by display name",
  JSON.stringify(listed.slice(0, -1)) === JSON.stringify(sorted)
);

const previewSrc = await page.$eval(".preview__image", (e) => e.getAttribute("src"));
check("shows a preview image before loading", !!previewSrc, String(previewSrc));

await page.screenshot({ path: `${OUT}/01-select.png` });

// Preview follows the cursor.
await press("ArrowDown");
const secondPreview = await page.$eval(".preview__image", (e) => e.getAttribute("src"));
check("the preview follows the cursor", secondPreview !== previewSrc, String(secondPreview));
await press("ArrowUp");

// --- loading an arena ------------------------------------------------------
await press("Enter", 300);
await page.waitForFunction(
  () => document.querySelector(".viewer__canvas")?.dataset.active === "true",
  { timeout: 60000 }
);
await page.waitForSelector(".loading", { state: "detached", timeout: 60000 });
await page.waitForTimeout(1500);

check("the selection UI is hidden once loaded", (await page.$(".select")) === null);

const warning = await page.$eval(".hud__warning", (e) => e.textContent.trim()).catch(() => null);
check("no missing-asset warnings", warning === null, String(warning));

await page.screenshot({ path: `${OUT}/02-arena.png` });

// --- the scene actually assembled -----------------------------------------
const stats = await page.evaluate(() => {
  const canvas = document.querySelector(".viewer__canvas");
  const px = canvas.width * canvas.height;
  return { width: canvas.width, height: canvas.height, px };
});
check("the canvas has a real viewport", stats.px > 100000, JSON.stringify(stats));

// Read pixels off the canvas: a rendered arena is not a flat clear colour.
const variety = await page.evaluate(() => {
  const canvas = document.querySelector(".viewer__canvas");
  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  const w = canvas.width, h = canvas.height;
  const buf = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  const seen = new Set();
  for (let i = 0; i < buf.length; i += 4 * 97) {
    seen.add(`${buf[i] >> 4},${buf[i + 1] >> 4},${buf[i + 2] >> 4}`);
  }
  return seen.size;
});
check("the arena renders geometry, not a blank clear colour", variety > 3, `${variety} distinct colours`);

// --- camera ----------------------------------------------------------------
const shot = async () => {
  const b = await page.locator(".viewer__canvas").screenshot();
  return b.length;
};

const before = await shot();
await press("KeyA", 250);
await press("KeyA", 250);
const afterRotate = await shot();
check("the control stick rotates the camera", before !== afterRotate);

await press("KeyI", 250);
await press("KeyI", 250);
const afterZoom = await shot();
check("C-Up zooms", afterRotate !== afterZoom);

await page.screenshot({ path: `${OUT}/03-camera.png` });

// --- closing ---------------------------------------------------------------
await press("Escape", 400);
check("Escape closes the scene and restores selection", (await page.$(".select")) !== null);

await press("Escape", 300);
const backAt = await page.$$eval(".item", (els) => els.map((e) => e.textContent.trim()));
check(
  "Escape from selection returns to Commissioner",
  backAt.includes("Arena Viewer"),
  JSON.stringify(backAt)
);

// --- reopening (engine was disposed) ---------------------------------------
await press("Enter", 400);
await page.waitForSelector(".viewer", { timeout: 10000 });
await press("Enter", 300);
await page.waitForSelector(".loading", { state: "detached", timeout: 60000 });
await page.waitForTimeout(1200);
check(
  "an arena can be reopened after the engine was disposed",
  (await page.$(".select")) === null && errors.length === 0
);

await page.screenshot({ path: `${OUT}/04-reopened.png` });

console.log("\n=== SUMMARY ===");
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log("failed:", failed.map((f) => f.n).join("; "));
console.log("ERRORS:", errors.length ? errors.slice(0, 5) : "none");

await browser.close();
process.exit(failed.length || errors.length ? 1 : 0);
