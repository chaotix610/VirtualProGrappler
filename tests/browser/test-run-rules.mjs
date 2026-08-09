import { chromium } from "playwright";

const URL = process.env.GAME_URL || "http://localhost:8080/#combat";

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.click('.roster__card:has(.roster__name:text-is("Ranger"))');
await page.waitForFunction(() => window.__game?.currentAnimation, { timeout: 60000 });
await page.waitForTimeout(1200);

const WALK = 2.2;
const RUN = 5.4;

const read = () =>
  page.evaluate(() => ({
    pos: window.__game.playerPosition,
    speed: window.__game.playerSpeed,
    anim: window.__game.currentAnimation,
    bounds: window.__game.ringBounds,
  }));

/**
 * Put the wrestler at the south end facing north (+z) with no momentum.
 *
 * Starting well back matters: the ring is only ~5.4 deep, and reaching the
 * ropes hands control to the rope beat, where speed is 0 by design. Run-mode
 * assertions must be sampled before that.
 */
async function reset() {
  await page.keyboard.up("Shift").catch(() => {});
  for (const k of ["w", "a", "s", "d"]) await page.keyboard.up(k).catch(() => {});
  await page.waitForTimeout(250);
  await page.evaluate(() => window.__game.teleportPlayer(0, -2.5, 0));
  await page.waitForTimeout(250);
}

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}\n        ${detail}`);
}

// ---------------------------------------------------------------- case 1
// Walking into the ropes must not rebound.
await reset();
await page.keyboard.down("w");
// Wait until he is actually against the ropes rather than for a fixed spell:
// the controller clamps its delta per frame, so on a slow renderer a wall
// clock wait advances much less travel than it appears to.
await page
  .waitForFunction(
    (maxZ) => window.__game.playerPosition.z >= maxZ - 0.02,
    (await read()).bounds.maxZ,
    { timeout: 30000 }
  )
  .catch(() => {});
const walkHit = await read();
await page.waitForTimeout(900);
const walkAfter = await read();
await page.keyboard.up("w");
check(
  "walk into ropes does not rebound",
  Math.abs(walkHit.pos.z - walkAfter.pos.z) < 0.2 &&
    walkAfter.pos.z > walkHit.bounds.maxZ - 0.05,
  `held at ropes z=${walkAfter.pos.z.toFixed(3)} (bound ${walkHit.bounds.maxZ.toFixed(3)}), no reversal`
);

// ---------------------------------------------------------------- case 2
// Shift alone runs, in the facing direction.
await reset();
const beforeShift = await read();
await page.keyboard.down("Shift");
await page.waitForTimeout(700);
const shiftOnly = await read();
check(
  "shift alone starts a run in the facing direction",
  shiftOnly.speed > RUN - 0.3 && shiftOnly.pos.z > beforeShift.pos.z + 1,
  `speed=${shiftOnly.speed.toFixed(2)} (run=${RUN}), moved +z ${(shiftOnly.pos.z - beforeShift.pos.z).toFixed(2)}`
);

// ---------------------------------------------------------------- case 3
// Adding a direction mid-run must be ignored in default mode.
await page.keyboard.down("d"); // would steer +x if it were honoured
await page.waitForTimeout(600);
const shiftThenDir = await read();
check(
  "direction pressed after shift is ignored",
  Math.abs(shiftThenDir.pos.x - shiftOnly.pos.x) < 0.35,
  `x drifted only ${(shiftThenDir.pos.x - shiftOnly.pos.x).toFixed(3)} while D held`
);

// ---------------------------------------------------------------- case 4
// Releasing shift ends a default run even with a direction still held.
await page.keyboard.up("Shift");
await page.waitForTimeout(700);
const afterShiftUp = await read();
await page.keyboard.up("d");
check(
  "default run ends on shift release",
  afterShiftUp.speed <= WALK + 0.3,
  `speed fell to ${afterShiftUp.speed.toFixed(2)} (walk=${WALK} or less)`
);

// ---------------------------------------------------------------- case 5
// Direction first, then shift: a directed run.
await reset();
await page.keyboard.down("w");
await page.waitForTimeout(350);
const walking = await read();
await page.keyboard.down("Shift");
await page.waitForTimeout(350);
const directed = await read();
check(
  "direction then shift gives a directed run",
  walking.speed < WALK + 0.4 && directed.speed > RUN - 0.4,
  `walk ${walking.speed.toFixed(2)} -> run ${directed.speed.toFixed(2)}`
);

// ---------------------------------------------------------------- case 6
// Releasing only shift keeps a directed run going.
await page.keyboard.up("Shift");
await page.waitForTimeout(280);
const shiftReleased = await read();
check(
  "directed run survives releasing shift alone",
  shiftReleased.speed > RUN - 0.6,
  `speed still ${shiftReleased.speed.toFixed(2)} with only W held (z=${shiftReleased.pos.z.toFixed(2)})`
);

// ---------------------------------------------------------------- case 7
// Releasing both ends it.
await page.keyboard.up("w");
await page.waitForTimeout(800);
const bothReleased = await read();
check(
  "directed run ends when both are released",
  bothReleased.speed < 0.2,
  `speed ${bothReleased.speed.toFixed(2)}`
);

// ---------------------------------------------------------------- case 8
// Releasing only the direction keeps a directed run going.
await reset();
await page.keyboard.down("w");
await page.waitForTimeout(300);
await page.keyboard.down("Shift");
await page.waitForTimeout(320);
await page.keyboard.up("w");
await page.waitForTimeout(280);
const dirReleased = await read();
await page.keyboard.up("Shift");
check(
  "directed run survives releasing the direction alone",
  dirReleased.speed > RUN - 0.6,
  `speed still ${dirReleased.speed.toFixed(2)} with only Shift held (z=${dirReleased.pos.z.toFixed(2)})`
);

// ---------------------------------------------------------------- case 9
// Running into the ropes still rebounds.
await reset();
await page.keyboard.down("w");
await page.keyboard.down("Shift");
const zs = [];
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(100);
  zs.push(+(await read()).pos.z.toFixed(3));
}
await page.keyboard.up("w");
await page.keyboard.up("Shift");
let turns = 0;
for (let i = 1; i < zs.length - 1; i++) {
  if (zs[i] - zs[i - 1] > 0 && zs[i + 1] - zs[i] < 0) turns++;
}
check(
  "running into ropes still rebounds",
  turns >= 1,
  `${turns} reversal(s); z peaked at ${Math.max(...zs).toFixed(3)}`
);

console.log("\n=== SUMMARY ===");
const failed = results.filter((r) => !r.pass);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log("failed:", failed.map((f) => f.name).join("; "));
console.log("ERRORS:", errors.length ? errors.slice(0, 5) : "none");

await browser.close();
process.exit(failed.length ? 1 : 0);
