import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const URL = process.env.GAME_URL || "http://localhost:8080/#combat";
const OUT = process.env.OUT_DIR || "./direction-shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.click('.roster__card:has(.roster__name:text-is("Ranger"))');
await page.waitForFunction(() => window.__game?.currentAnimation, { timeout: 60000 });
await page.waitForTimeout(1200);

/**
 * Where the wrestler appears on screen, in pixels. Asserting against the
 * projected position rather than world axes is what actually matters: the
 * player presses "left" expecting the character to travel left in the image.
 */
const screenPos = () =>
  page.evaluate(() => {
    const g = window.__game;
    const p = g.playerPosition;
    const cam = g.scene.activeCamera;
    const engine = g.scene.getEngine();
    const w = engine.getRenderWidth();
    const h = engine.getRenderHeight();

    // Project the world point through the camera by hand.
    const view = cam.getViewMatrix();
    const proj = cam.getProjectionMatrix();
    const m = view.multiply(proj);
    const r = m.m;
    const x = p.x, y = p.y + 0.9, z = p.z;
    const rw = r[3] * x + r[7] * y + r[11] * z + r[15];
    const cx = (r[0] * x + r[4] * y + r[8] * z + r[12]) / rw;
    const cy = (r[1] * x + r[5] * y + r[9] * z + r[13]) / rw;
    return {
      sx: +(((cx + 1) / 2) * w).toFixed(1),
      sy: +(((1 - cy) / 2) * h).toFixed(1),
      world: { x: +p.x.toFixed(3), z: +p.z.toFixed(3) },
    };
  });

async function reset() {
  for (const k of ["w", "a", "s", "d"]) await page.keyboard.up(k).catch(() => {});
  await page.keyboard.up("Shift").catch(() => {});
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__game.teleportPlayer(0, 0, 0));
  await page.waitForTimeout(250);
}

const results = [];
const check = (n, p, d) => {
  results.push({ n, p });
  console.log(`${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`);
};

async function press(key, ms = 650) {
  await reset();
  const before = await screenPos();
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  const after = await screenPos();
  await page.keyboard.up(key);
  return { before, after, dx: +(after.sx - before.sx).toFixed(1), dy: +(after.sy - before.sy).toFixed(1) };
}

const d = await press("d");
check(
  "D moves the wrestler RIGHT on screen",
  d.dx > 40,
  `screen x ${d.before.sx} -> ${d.after.sx} (dx ${d.dx}), world x ${d.after.world.x}`
);

const a = await press("a");
check(
  "A moves the wrestler LEFT on screen",
  a.dx < -40,
  `screen x ${a.before.sx} -> ${a.after.sx} (dx ${a.dx}), world x ${a.after.world.x}`
);

const w = await press("w");
check(
  "W moves the wrestler AWAY (up screen)",
  w.dy < -15,
  `screen y ${w.before.sy} -> ${w.after.sy} (dy ${w.dy}), world z ${w.after.world.z}`
);

const s = await press("s");
check(
  "S moves the wrestler TOWARD the camera (down screen)",
  s.dy > 15,
  `screen y ${s.before.sy} -> ${s.after.sy} (dy ${s.dy}), world z ${s.after.world.z}`
);

// Arrow keys must agree with WASD.
const right = await press("ArrowRight");
check(
  "ArrowRight matches D",
  right.dx > 40,
  `dx ${right.dx}`
);
const left = await press("ArrowLeft");
check(
  "ArrowLeft matches A",
  left.dx < -40,
  `dx ${left.dx}`
);

// Diagonal: W+D should go up and right.
await reset();
await page.keyboard.down("w");
await page.keyboard.down("d");
const diagBefore = await screenPos();
await page.waitForTimeout(650);
const diagAfter = await screenPos();
await page.keyboard.up("w");
await page.keyboard.up("d");
check(
  "W+D goes up and to the right",
  diagAfter.sx - diagBefore.sx > 20 && diagAfter.sy - diagBefore.sy < -5,
  `dx ${(diagAfter.sx - diagBefore.sx).toFixed(1)}, dy ${(diagAfter.sy - diagBefore.sy).toFixed(1)}`
);

// Visual proof.
await reset();
await page.keyboard.down("d");
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/pressed-D-should-be-right.png` });
await page.keyboard.up("d");
await reset();
await page.keyboard.down("a");
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/pressed-A-should-be-left.png` });
await page.keyboard.up("a");

console.log("\n=== SUMMARY ===");
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log("failed:", failed.map((f) => f.n).join("; "));
console.log("ERRORS:", errors.length ? errors.slice(0, 5) : "none");

await browser.close();
process.exit(failed.length ? 1 : 0);
