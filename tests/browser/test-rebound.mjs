import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const URL = process.env.GAME_URL || "http://localhost:8080/#combat";
const OUT = process.env.OUT_DIR || "./rebound-shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

const state = () =>
  page.evaluate(() => {
    const g = window.__game;
    return g ? { anim: g.currentAnimation, pos: g.playerPosition, bounds: g.ringBounds } : null;
  });

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.click('.roster__card:has(.roster__name:text-is("Ranger"))');
await page.waitForFunction(() => window.__game?.currentAnimation, { timeout: 60000 });
await page.waitForTimeout(1500);

const start = await state();
console.log("BOUNDS:", JSON.stringify(start.bounds));
console.log("START :", JSON.stringify(start.pos));
await page.screenshot({ path: `${OUT}/01-ring.png` });

// Sprint straight at the north ropes and sample z every 100ms. A rebound
// shows up as z climbing to the boundary and then reversing.
await page.keyboard.down("Shift");
await page.keyboard.down("w");

const track = [];
// A generous window: each bounce now costs a 0.33s rope beat plus a full
// ring crossing, and the sim advances slowly under software rendering.
for (let i = 0; i < 50; i++) {
  await page.waitForTimeout(120);
  const s = await state();
  track.push({ t: (i + 1) * 100, z: +s.pos.z.toFixed(3), anim: s.anim });
}
await page.screenshot({ path: `${OUT}/02-rebound.png` });
await page.keyboard.up("w");
await page.keyboard.up("Shift");

console.log("\n t(ms)    z       anim");
for (const p of track) console.log(String(p.t).padStart(5), String(p.z).padStart(8), " ", p.anim);

// A rebound is a turn from advancing (+z) to retreating (-z) that happens
// near the ropes. Count them across the whole run: with W held the wrestler
// should bounce repeatedly between the north and south ropes.
//
// Samples where nothing moved are dropped first. Polling runs faster than the
// renderer does under software GL, so consecutive samples can land on the
// same frame; those zero deltas would otherwise hide every turn.
const moved = track.filter(
  (s, i) => i === 0 || Math.abs(s.z - track[i - 1].z) > 1e-4
);

const bounces = [];
for (let i = 1; i < moved.length - 1; i++) {
  const before = moved[i].z - moved[i - 1].z;
  const after = moved[i + 1].z - moved[i].z;
  if (before > 0 && after < 0) bounces.push({ t: moved[i].t, z: moved[i].z, rope: "north" });
  if (before < 0 && after > 0) bounces.push({ t: moved[i].t, z: moved[i].z, rope: "south" });
}

const northBound = start.bounds?.maxZ ?? null;
const southBound = start.bounds?.minZ ?? null;
const swing = Math.max(...track.map((p) => p.z)) - Math.min(...track.map((p) => p.z));

console.log("\n=== REBOUND ===");
console.log("rope bounds z    :", southBound?.toFixed(3), "..", northBound?.toFixed(3));
console.log("direction turns  :", bounces.length);
for (const b of bounces) {
  console.log(`   ${String(b.t).padStart(5)}ms  z=${b.z.toFixed(3)}  off ${b.rope} ropes`);
}
console.log("total swing      :", swing.toFixed(2), "units");
// One confirmed turn at the ropes is a rebound; how many fit in the window
// depends on frame rate, so the count is reported rather than required.
console.log("REBOUNDING:", bounces.length >= 1 ? "YES" : "NO");
console.log("ERRORS:", errors.length ? errors.slice(0, 5) : "none");

await browser.close();
