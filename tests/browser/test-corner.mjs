import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const URL = process.env.GAME_URL || "http://localhost:8080/#combat";
const OUT = process.env.OUT_DIR || "./corner-shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 620 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.click('.roster__card:has(.roster__name:text-is("Ranger"))');
await page.waitForFunction(() => window.__game?.currentAnimation, { timeout: 60000 });
await page.waitForTimeout(1200);

const results = [];
const check = (n, p, d) => {
  results.push({ n, p });
  console.log(`${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`);
};

const bounds = await page.evaluate(() => window.__game.ringBounds);
console.log("bounds:", JSON.stringify(bounds));

async function releaseAll() {
  for (const k of ["w", "a", "s", "d"]) await page.keyboard.up(k).catch(() => {});
  await page.keyboard.up("Shift").catch(() => {});
  await page.waitForTimeout(250);
}

/**
 * Traces player state every rendered frame, stopping either at `stopAnim` or
 * after `maxMs`.
 *
 * Waiting on the state rather than a fixed duration matters: the controller
 * clamps its delta to 0.1s per frame, so on a slow software renderer a
 * wall-clock window advances far less simulation than it looks like it should
 * - which silently truncates a phase mid-way.
 */
async function traceFor(maxMs, stopAnim = null) {
  return page.evaluate(async ([duration, stop]) => {
    const g = window.__game;
    const out = [];
    const t0 = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        const p = g.playerPosition;
        out.push({
          t: +(performance.now() - t0).toFixed(0),
          x: +p.x.toFixed(3),
          y: +p.y.toFixed(3),
          z: +p.z.toFixed(3),
          anim: g.currentAnimation,
        });
        const reached = stop !== null && g.currentAnimation === stop;
        if (!reached && performance.now() - t0 < duration) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
    return out;
  }, [maxMs, stopAnim]);
}

// Start near the corner and run diagonally into it.
await releaseAll();
await page.evaluate(() => {
  const b = window.__game.ringBounds;
  window.__game.teleportPlayer(b.maxX - 2.0, b.maxZ - 2.0, 0);
});
await page.waitForTimeout(300);

await page.keyboard.down("w");
await page.keyboard.down("d");
await page.waitForTimeout(80);
await page.keyboard.down("Shift");

// Hold everything: he should climb, then stay perched. Run until he is
// actually up there rather than for a fixed stretch of wall time.
const climbTrace = await traceFor(20000, "Crouch_Idle_Loop");
// Then a short window to confirm he stays there while the buttons are held.
const perchTrace = await traceFor(1500);
climbTrace.push(...perchTrace);

const climbed = climbTrace.find((s) => s.anim === "ClimbUp_1m");
check(
  "running into the corner starts a climb",
  !!climbed,
  climbed ? `ClimbUp_1m at ${climbed.t}ms, y=${climbed.y}` : "ClimbUp_1m never played"
);

const perch = climbTrace.filter((s) => s.anim === "Crouch_Idle_Loop");
const topY = perch.length ? perch[perch.length - 1].y : 0;
check(
  "he reaches the top rope",
  perch.length > 0 && topY > bounds.topRopeY - 0.15,
  `perched at y=${topY} (top rope ${bounds.topRopeY.toFixed(3)})`
);

const last = climbTrace[climbTrace.length - 1];
check(
  "he stays perched while the buttons are held",
  last.anim === "Crouch_Idle_Loop" && last.y > bounds.topRopeY - 0.15,
  `after ${last.t}ms still ${last.anim} at y=${last.y}`
);

const perchPos = { x: last.x, y: last.y, z: last.z };
await page.screenshot({ path: `${OUT}/01-perched.png` });

// Let go: he should dive off and land on his feet.
await releaseAll();
const diveTrace = await traceFor(2600);

const launched = diveTrace.find((s) => s.anim === "NinjaJump_Start");
check(
  "releasing the buttons launches him off the top rope",
  !!launched,
  launched ? `NinjaJump_Start at ${launched.t}ms` : "NinjaJump_Start never played"
);

const peak = Math.max(...diveTrace.map((s) => s.y));
check(
  "the dive arcs upward before falling",
  peak > perchPos.y + 0.2,
  `peak y=${peak.toFixed(3)} vs perch ${perchPos.y}`
);

const landed = diveTrace[diveTrace.length - 1];
const travelled = Math.hypot(landed.x - perchPos.x, landed.z - perchPos.z);
check(
  "he lands standing in the ring",
  landed.y < 0.01 &&
    landed.x > bounds.minX - 0.01 && landed.x < bounds.maxX + 0.01 &&
    landed.z > bounds.minZ - 0.01 && landed.z < bounds.maxZ + 0.01,
  `landed at (${landed.x}, ${landed.y}, ${landed.z}), ${travelled.toFixed(2)} units from the corner`
);

const backToIdle = diveTrace.slice(-6).some((s) => s.anim === "Idle_Loop");
check(
  "control returns after the landing",
  backToIdle,
  `final clip: ${landed.anim}`
);

await page.screenshot({ path: `${OUT}/03-landed.png` });

console.log("\n--- climb ---");
for (const s of climbTrace.filter((_, i) => i % 3 === 0).slice(0, 22)) {
  console.log(`${String(s.t).padStart(5)}ms  (${String(s.x).padStart(7)}, ${String(s.y).padStart(6)}, ${String(s.z).padStart(7)})  ${s.anim}`);
}
console.log("--- dive ---");
for (const s of diveTrace.filter((_, i) => i % 3 === 0).slice(0, 22)) {
  console.log(`${String(s.t).padStart(5)}ms  (${String(s.x).padStart(7)}, ${String(s.y).padStart(6)}, ${String(s.z).padStart(7)})  ${s.anim}`);
}

console.log("\n=== SUMMARY ===");
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log("failed:", failed.map((f) => f.n).join("; "));
console.log("ERRORS:", errors.length ? errors.slice(0, 5) : "none");

await browser.close();
process.exit(failed.length ? 1 : 0);
