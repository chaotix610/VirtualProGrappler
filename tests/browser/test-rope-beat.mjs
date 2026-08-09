import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const URL = process.env.GAME_URL || "http://localhost:8080/#combat";
const OUT = process.env.OUT_DIR || "./beat-shots";
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
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}\n        ${detail}`);
};

async function releaseAll() {
  for (const k of ["w", "a", "s", "d"]) await page.keyboard.up(k).catch(() => {});
  await page.keyboard.up("Shift").catch(() => {});
  await page.waitForTimeout(250);
}

// ------------------------------------------------------- walking is silent
await releaseAll();
await page.evaluate(() => window.__game.teleportPlayer(0, -1.5, 0));
await page.waitForTimeout(300);

await page.keyboard.down("w");
const walkBows = [];
for (let i = 0; i < 34; i++) {
  await page.waitForTimeout(100);
  walkBows.push(
    +(await page.evaluate(() => window.__game.ringRopes.displacementOf("+z"))).toFixed(5)
  );
}
await page.keyboard.up("w");
const walkPeak = Math.max(...walkBows.map(Math.abs));
check(
  "walking into the ropes leaves them completely still",
  walkPeak === 0,
  `max rope movement over ${walkBows.length} samples: ${walkPeak}`
);

// --------------------------------------------------- running: the rope beat
await releaseAll();
await page.evaluate(() => window.__game.teleportPlayer(0, -1.5, 0));
await page.waitForTimeout(300);

// Direction first, then Shift: a directed run straight at the north ropes.
await page.keyboard.down("w");
await page.waitForTimeout(80);
await page.keyboard.down("Shift");

// Sample densely from inside the page so the 0.33s beat is not missed.
const trace = await page.evaluate(async () => {
  const g = window.__game;
  const out = [];
  const t0 = performance.now();
  await new Promise((resolve) => {
    const tick = () => {
      out.push({
        t: +(performance.now() - t0).toFixed(0),
        z: +g.playerPosition.z.toFixed(3),
        yaw: +g.playerFacing.toFixed(3),
        anim: g.currentAnimation,
        bow: +g.ringRopes.displacementOf("+z").toFixed(4),
      });
      if (performance.now() - t0 < 2600) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
  return out;
});
await releaseAll();

// The clip plays once per rope contact, so isolate the FIRST contiguous run
// of Hit_Chest frames - spanning first-to-last would cover both bounces.
const firstHit = trace.findIndex((s) => s.anim === "Hit_Chest");
const hitFrames = [];
if (firstHit >= 0) {
  for (let i = firstHit; i < trace.length && trace[i].anim === "Hit_Chest"; i++) {
    hitFrames.push(trace[i]);
  }
}
// The beat ends when the next clip takes over, not on the last sampled frame.
const endIdx = firstHit + hitFrames.length;
const beatMs = hitFrames.length
  ? (endIdx < trace.length ? trace[endIdx].t : hitFrames[hitFrames.length - 1].t) -
    hitFrames[0].t
  : 0;

check(
  "running into the ropes plays the rope-hit beat",
  firstHit >= 0,
  firstHit >= 0
    ? `Hit_Chest began at ${trace[firstHit].t}ms, z=${trace[firstHit].z}`
    : "Hit_Chest never played"
);

check(
  "the beat lasts about 0.33s",
  beatMs >= 250 && beatMs <= 460,
  `beat measured ${beatMs}ms (target ~330ms)`
);

// Facing: he arrives running +z (yaw 0) and must end facing -z (|yaw| ~ PI).
if (firstHit >= 0) {
  const before = trace[Math.max(0, firstHit - 3)];
  const after = hitFrames[hitFrames.length - 1];
  const turned = Math.abs(Math.abs(after.yaw) - Math.PI) < 0.5;
  check(
    "he turns his back to the ropes during the beat",
    turned,
    `yaw ${before.yaw} -> ${after.yaw} (PI = back to the north ropes)`
  );

  const bowDuringBeat = Math.max(...hitFrames.map((s) => s.bow));
  check(
    "the ropes load while he is against them",
    bowDuringBeat > 0.1,
    `rope bow peaked at ${bowDuringBeat.toFixed(3)} during the beat`
  );

  const afterBeat = trace.slice(endIdx);
  const wentBack = afterBeat.some((s) => s.z < trace[firstHit].z - 1.5);
  check(
    "he is thrown back the other way after the beat",
    wentBack,
    `z went from ${trace[firstHit].z} to ${Math.min(...afterBeat.map((s) => s.z)).toFixed(3)}`
  );
}

console.log("\n--- trace around the ropes ---");
const from = Math.max(0, firstHit - 4);
for (const s of trace.slice(from, from + 34)) {
  console.log(
    `${String(s.t).padStart(5)}ms  z=${String(s.z).padStart(7)}  yaw=${String(s.yaw).padStart(7)}  bow=${String(s.bow).padStart(7)}  ${s.anim}`
  );
}

console.log("\n=== SUMMARY ===");
const failed = results.filter((r) => !r.pass);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log("failed:", failed.map((f) => f.name).join("; "));
console.log("ERRORS:", errors.length ? errors.slice(0, 5) : "none");

await browser.close();
process.exit(failed.length ? 1 : 0);
