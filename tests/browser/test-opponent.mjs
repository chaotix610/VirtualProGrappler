import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const URL = process.env.GAME_URL || "http://localhost:8080/#combat";
const OUT = process.env.OUT_DIR || "./opponent-shots";
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
await page.waitForTimeout(1500);

const results = [];
const check = (n, p, d) => {
  results.push({ n, p });
  console.log(`${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`);
};

const read = () =>
  page.evaluate(() => {
    const g = window.__game;
    return {
      player: g.playerPosition,
      yaw: g.playerFacing,
      opp: g.opponentPosition,
      oppYaw: g.opponentFacing,
      anim: g.currentAnimation,
      speed: g.playerSpeed,
      bounds: g.ringBounds,
    };
  });

/** Angle in radians between the wrestler's facing and the line to a point. */
function facingError(from, yaw, to) {
  const want = Math.atan2(to.x - from.x, to.z - from.z);
  let d = (want - yaw) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

async function releaseAll() {
  for (const k of ["w", "a", "s", "d"]) await page.keyboard.up(k).catch(() => {});
  await page.keyboard.up("Shift").catch(() => {});
  await page.waitForTimeout(300);
}

const start = await read();
console.log("player:", JSON.stringify(start.player));
console.log("opponent:", JSON.stringify(start.opp));

check(
  "an opponent is in the ring",
  !!start.opp,
  start.opp ? `at (${start.opp.x.toFixed(2)}, ${start.opp.z.toFixed(2)})` : "no opponent"
);

check(
  "they start facing each other",
  facingError(start.player, start.yaw, start.opp) < 0.2 &&
    facingError(start.opp, start.oppYaw, start.player) < 0.2,
  `player off by ${facingError(start.player, start.yaw, start.opp).toFixed(3)} rad, ` +
    `opponent off by ${facingError(start.opp, start.oppYaw, start.player).toFixed(3)} rad`
);
await page.screenshot({ path: `${OUT}/01-squared-up.png` });

// --------------------------------------------- walking never turns his back
const walkErrors = [];
for (const key of ["s", "a", "d"]) {
  await releaseAll();
  await page.evaluate(() => window.__game.teleportPlayer(0, -1.6));
  await page.waitForTimeout(300);
  await page.keyboard.down(key);
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(110);
    const s = await read();
    walkErrors.push({ key, err: facingError(s.player, s.yaw, s.opp), anim: s.anim });
  }
  await page.keyboard.up(key);
}
const worstWalk = Math.max(...walkErrors.map((w) => w.err));
check(
  "walking in any direction still faces the opponent",
  worstWalk < 0.35,
  `worst facing error while walking S/A/D: ${worstWalk.toFixed(3)} rad`
);
await page.screenshot({ path: `${OUT}/02-walking-backward.png` });

// Walking backwards specifically: he must move away but keep facing them.
await releaseAll();
await page.evaluate(() => window.__game.teleportPlayer(0, -1.6));
await page.waitForTimeout(300);
const beforeBack = await read();
await page.keyboard.down("s");
await page.waitForTimeout(700);
const afterBack = await read();
await page.keyboard.up("s");
check(
  "walking backward moves away while still facing them",
  afterBack.player.z < beforeBack.player.z - 0.5 &&
    facingError(afterBack.player, afterBack.yaw, afterBack.opp) < 0.35,
  `z ${beforeBack.player.z.toFixed(2)} -> ${afterBack.player.z.toFixed(2)}, ` +
    `facing error ${facingError(afterBack.player, afterBack.yaw, afterBack.opp).toFixed(3)} rad`
);

// ------------------------------------------------- running faces the travel
// Run east, not south: it leaves plenty of runway before the ropes (whose
// rope-hit beat would seize the facing), and east is clearly distinct from
// the direction of the opponent.
await releaseAll();
await page.evaluate(() => window.__game.teleportPlayer(-1.5, -1.0));
await page.waitForTimeout(300);
await page.keyboard.down("d");
await page.waitForTimeout(90);
await page.keyboard.down("Shift");
await page.waitForTimeout(450);
const running = await read();
await releaseAll();

const runTravelYaw = Math.PI / 2; // running east (+x)
const angleDiff = (a, b) => {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
};
const runErr = angleDiff(running.yaw, runTravelYaw);
check(
  "running turns him to face where he is going, not the opponent",
  runErr < 0.4 && facingError(running.player, running.yaw, running.opp) > 0.8,
  `facing ${running.yaw.toFixed(3)} rad vs travel ${runTravelYaw.toFixed(3)} ` +
    `(off by ${runErr.toFixed(3)}), and ${facingError(running.player, running.yaw, running.opp).toFixed(2)} rad off the opponent`
);
await page.screenshot({ path: `${OUT}/03-running-away.png` });

// ------------------------------------------------------- diagonals to corners
const b = start.bounds;
const corners = [
  { keys: ["w", "d"], name: "NE", x: b.maxX, z: b.maxZ },
  { keys: ["s", "d"], name: "SE", x: b.maxX, z: b.minZ },
  { keys: ["w", "a"], name: "NW", x: b.minX, z: b.maxZ },
  { keys: ["s", "a"], name: "SW", x: b.minX, z: b.minZ },
];

for (const c of corners) {
  await releaseAll();
  // Start off-centre so a fixed 45 degree heading would miss the corner.
  await page.evaluate(() => window.__game.teleportPlayer(-1.4, 0.9));
  await page.waitForTimeout(300);
  const from = await read();

  for (const k of c.keys) await page.keyboard.down(k);
  await page.waitForTimeout(1400);
  const to = await read();
  for (const k of c.keys) await page.keyboard.up(k);

  const distBefore = Math.hypot(from.player.x - c.x, from.player.z - c.z);
  const distAfter = Math.hypot(to.player.x - c.x, to.player.z - c.z);
  check(
    `${c.keys.join("+").toUpperCase()} heads for the ${c.name} corner`,
    distAfter < distBefore - 0.8,
    `distance to ${c.name} ${distBefore.toFixed(2)} -> ${distAfter.toFixed(2)}, ` +
      `now at (${to.player.x.toFixed(2)}, ${to.player.z.toFixed(2)}) vs corner (${c.x.toFixed(2)}, ${c.z.toFixed(2)})`
  );
}

console.log("\n=== SUMMARY ===");
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log("failed:", failed.map((f) => f.n).join("; "));
console.log("ERRORS:", errors.length ? errors.slice(0, 5) : "none");

await browser.close();
process.exit(failed.length ? 1 : 0);
