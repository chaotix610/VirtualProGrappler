/**
 * Drives the Combat System Test's mouse camera.
 *
 * Checks that a left-drag orbits it, the wheel zooms within its limits, the
 * right button and the arrow keys leave it alone, a resize keeps the angle
 * the player chose, and that turning the camera does not turn the controls:
 * up still walks north and right still walks east.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const URL = process.env.GAME_URL || "http://localhost:8080/#combat";
const OUT = process.env.OUT_DIR || "./camera-shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures++;
};

const camera = () =>
  page.evaluate(() => {
    const c = window.__combat.camera;
    return {
      alpha: c.alpha,
      beta: c.beta,
      radius: c.radius,
      min: c.lowerRadiusLimit,
      max: c.upperRadiusLimit,
    };
  });
const position = () =>
  page.evaluate(() => {
    const p = window.__combat.playerRoot.position;
    return { x: p.x, z: p.z };
  });
const hold = async (key, ms) => {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
  await page.waitForTimeout(400);
};

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__combat?.currentAnimation, null, {
  timeout: 120000,
});
await page.waitForTimeout(1000);

const start = await camera();
console.log("CAMERA:", JSON.stringify(start));
await page.screenshot({ path: `${OUT}/01-framed.png` });

// --- drag to orbit ----------------------------------------------------------
await page.mouse.move(550, 350);
await page.mouse.down();
await page.mouse.move(800, 300, { steps: 15 });
await page.mouse.up();
await page.waitForTimeout(800);
const dragged = await camera();
check(Math.abs(dragged.alpha - start.alpha) > 0.2, "left-drag turns the camera");
check(Math.abs(dragged.beta - start.beta) > 0.02, "left-drag tilts the camera");

// --- wheel to zoom ----------------------------------------------------------
await page.mouse.wheel(0, -600);
await page.waitForTimeout(800);
check((await camera()).radius < dragged.radius, "scrolling up zooms in");

for (let i = 0; i < 20; i++) await page.mouse.wheel(0, -600);
await page.waitForTimeout(800);
const closest = await camera();
check(Math.abs(closest.radius - closest.min) < 0.05, "zoom stops at its closest");

for (let i = 0; i < 40; i++) await page.mouse.wheel(0, 600);
await page.waitForTimeout(800);
const furthest = await camera();
check(Math.abs(furthest.radius - furthest.max) < 0.05, "zoom stops at its furthest");

await page.mouse.wheel(0, -1500);
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/02-orbited.png` });

// --- what must not move it --------------------------------------------------
const before = await camera();
await page.mouse.move(550, 350);
await page.mouse.down({ button: "right" });
await page.mouse.move(300, 350, { steps: 10 });
await page.mouse.up({ button: "right" });
await page.waitForTimeout(500);
check(
  JSON.stringify(before) === JSON.stringify(await camera()),
  "right-drag leaves the camera alone"
);

// --- controls stay on the compass --------------------------------------------
const p0 = await position();
await hold("ArrowUp", 600);
const p1 = await position();
const afterArrows = await camera();
check(
  afterArrows.alpha === before.alpha && afterArrows.beta === before.beta,
  "arrow keys do not move the camera"
);
check(
  p1.z - p0.z > 0.3 && Math.abs(p1.x - p0.x) < 0.05,
  `up walks north with the camera turned (dx=${(p1.x - p0.x).toFixed(3)} dz=${(p1.z - p0.z).toFixed(3)})`
);

await hold("ArrowRight", 500);
const p2 = await position();
check(
  p2.x - p1.x > 0.3 && Math.abs(p2.z - p1.z) < 0.05,
  `right walks east with the camera turned (dx=${(p2.x - p1.x).toFixed(3)} dz=${(p2.z - p1.z).toFixed(3)})`
);

// --- resize ----------------------------------------------------------------
await page.setViewportSize({ width: 800, height: 700 });
await page.waitForTimeout(800);
const resized = await camera();
check(
  Math.abs(resized.alpha - afterArrows.alpha) < 1e-3 &&
    Math.abs(resized.beta - afterArrows.beta) < 1e-3,
  "a resize keeps the chosen angle"
);

check(errors.length === 0, `no page errors ${errors.length ? errors.slice(0, 3) : ""}`);

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
