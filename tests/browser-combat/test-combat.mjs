/**
 * Drives Combat System Test: Austin against an idle Austin in the RAW
 * arena, on the control mapper's default bindings.
 *
 * Checks that the arena and both wrestlers load, that the stick walks him
 * around the ring, that holding Run (C-Down) into the ropes rebounds him back
 * and forth, and that the opponent stays put in his idle clip throughout.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const URL = process.env.GAME_URL || "http://localhost:8080/#combat";
const OUT = process.env.OUT_DIR || "./combat-shots";
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
    const g = window.__combat;
    return g
      ? {
          anim: g.currentAnimation,
          opponentAnim: g.opponentAnimation,
          pos: g.playerPosition,
          opponent: g.opponentPosition,
          bounds: g.ringBounds,
        }
      : null;
  });

let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures++;
};

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__combat?.currentAnimation, null, {
  timeout: 120000,
});
await page.waitForTimeout(1500);

const start = await state();
console.log("BOUNDS  :", JSON.stringify(start.bounds));
console.log("PLAYER  :", JSON.stringify(start.pos));
console.log("OPPONENT:", JSON.stringify(start.opponent));
await page.screenshot({ path: `${OUT}/01-loaded.png` });

check(start.bounds !== null, "ring bounds measured from the RAW arena's ropes");
check(Math.abs(start.pos.y) < 1e-3, "player stands on the mat (y = 0)");
check(start.anim === "Idle_Loop", `player idles at rest (${start.anim})`);
check(start.opponentAnim === "Idle_Loop", `opponent idles (${start.opponentAnim})`);

// --- walking --------------------------------------------------------------
// D is Control Stick Right by default. Walk sideways so he never meets the
// opponent, and sample mid-stride.
await page.keyboard.down("d");
await page.waitForTimeout(900);
const walking = await state();
await page.screenshot({ path: `${OUT}/02-walking.png` });
await page.waitForTimeout(600);
await page.keyboard.up("d");
const walked = await state();
check(walking.anim === "Walk_Loop", `stick walks (${walking.anim})`);
check(walked.pos.x > start.pos.x + 0.5, `walked right ${(walked.pos.x - start.pos.x).toFixed(2)}`);

// The d-pad moves too. Left Arrow is D-Pad Left.
await page.keyboard.down("ArrowLeft");
await page.waitForTimeout(800);
await page.keyboard.up("ArrowLeft");
const dpad = await state();
check(dpad.pos.x < walked.pos.x - 0.3, "d-pad walks");

await page.waitForTimeout(800);
check((await state()).anim === "Idle_Loop", "settles back to idle");

// --- running the ropes ----------------------------------------------------
// Run an east-west lane through the middle of the ring. It has to stay more
// than a corner radius (1.15) from the north and south ropes, or arriving at
// the east ropes counts as reaching the corner and he climbs it instead; and
// clear of the opponent, who stands on the z axis at +1.6.
await page.evaluate(() => window.__combat.teleportPlayer(0, -0.6, Math.PI / 2));
await page.waitForTimeout(300);

// Direction first, then Run: a directed run that keeps going while either is
// held. K is C-Down by default.
await page.keyboard.down("d");
await page.waitForTimeout(80);
await page.keyboard.down("k");

const track = [];
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(120);
  const s = await state();
  track.push({ x: +s.pos.x.toFixed(3), anim: s.anim, opp: s.opponent, oppAnim: s.opponentAnim });
  if (i === 12) await page.screenshot({ path: `${OUT}/03-rope-run.png` });
}
await page.keyboard.up("k");
await page.keyboard.up("d");

console.log("\n   x      anim");
for (const p of track) console.log(String(p.x).padStart(7), " ", p.anim);

const anims = new Set(track.map((p) => p.anim));
check(anims.has("Sprint_Loop"), "runs with C-Down held");
check(anims.has("Hit_Chest"), "takes the ropes back-first");

// A rebound is a turn in x that happens near a rope wall.
const moved = track.filter((p, i) => i === 0 || p.x !== track[i - 1].x);
let turns = 0;
let dir = 0;
for (let i = 1; i < moved.length; i++) {
  const d = Math.sign(moved[i].x - moved[i - 1].x);
  if (d && dir && d !== dir) {
    const nearRopes =
      Math.abs(moved[i - 1].x - start.bounds.maxX) < 0.6 ||
      Math.abs(moved[i - 1].x - start.bounds.minX) < 0.6;
    if (nearRopes) turns++;
  }
  if (d) dir = d;
}
check(turns >= 2, `rebounds off the ropes repeatedly (${turns} rebounds)`);

const xs = track.map((p) => p.x);
check(
  Math.max(...xs) <= start.bounds.maxX + 0.35 && Math.min(...xs) >= start.bounds.minX - 0.35,
  "stays inside the ropes"
);

// --- the opponent ---------------------------------------------------------
const oppMoved = track.some(
  (p) => Math.hypot(p.opp.x - start.opponent.x, p.opp.z - start.opponent.z) > 1e-3
);
check(!oppMoved, "opponent holds his spot");
check(track.every((p) => p.oppAnim === "Idle_Loop"), "opponent stays in idle");

// --- legend and evade -----------------------------------------------------
const legend = await page.$$eval(".hud__icon", (imgs) =>
  imgs.map((img) => img.alt)
);
check(
  ["D-Pad", "C-Down", "B", "A", "R", "L", "Start"].every((b) => legend.includes(b)),
  `legend shows the pad buttons (${legend.join(", ")})`
);
const hudText = await page.$eval(".hud__keys", (el) => el.textContent);
check(!/Escape|Space|Enter/.test(hudText), "legend shows no keyboard keys");

await page.waitForTimeout(800);
await page.keyboard.press("q"); // L
await page.waitForTimeout(150);
const evade = (await state()).anim;
check(/roll/i.test(evade), `evades on L (${evade})`);
await page.waitForTimeout(1500);

// --- pause ----------------------------------------------------------------
await page.waitForTimeout(800);
await page.keyboard.press("Space"); // Start
await page.waitForTimeout(300);
const pausedAt = (await state()).pos;
await page.keyboard.down("d");
await page.waitForTimeout(500);
await page.keyboard.up("d");
const stillPaused = (await state()).pos;
await page.screenshot({ path: `${OUT}/04-paused.png` });
check(
  Math.hypot(stillPaused.x - pausedAt.x, stillPaused.z - pausedAt.z) < 1e-3,
  "Start pauses: the stick does nothing while paused"
);
await page.keyboard.press("Escape"); // B resumes
await page.waitForTimeout(300);
check(
  await page.evaluate(() => !window.__combat.isPaused),
  "B resumes"
);

check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
