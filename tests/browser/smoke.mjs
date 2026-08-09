import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const URL = process.env.GAME_URL || "http://localhost:8080/#combat";
const OUT = process.env.OUT_DIR || "/tmp/claude-1000/-home-chris-Development-GitHub-chaotix610-Babylon-101-01-Basic-Scene/83ba6136-b6f2-4de1-8a09-a08363a3eb21/scratchpad/shots";
mkdirSync(OUT, { recursive: true });

const errors = [];
const logs = [];

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });

page.on("console", (m) => {
  logs.push(`[${m.type()}] ${m.text()}`);
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));

const state = () =>
  page.evaluate(() => {
    const g = window.__game;
    return g ? { anim: g.currentAnimation, pos: g.playerPosition } : null;
  });

const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await shot("01-select");

const names = await page.$$eval(".roster__name", (els) =>
  els.map((e) => e.textContent.trim())
);
console.log("ROSTER:", names.join(", "));

const CHARACTER = process.env.CHARACTER || "Ranger";
console.log("TESTING:", CHARACTER);
await page.click(`.roster__card:has(.roster__name:text-is("${CHARACTER}"))`);
await page.waitForFunction(() => window.__game?.currentAnimation !== null, {
  timeout: 60000,
});
await page.waitForTimeout(2000);
await shot("02-idle");
console.log("IDLE:", JSON.stringify(await state()));

/** Back to the south end with no momentum, well clear of the ropes. */
async function recentre() {
  await page.evaluate(() => window.__game.teleportPlayer(0, -2.5, 0));
  await page.waitForTimeout(200);
}

async function hold(keys, ms, label) {
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  const s = await state();
  await shot(label);
  console.log(`${label.toUpperCase()}:`, JSON.stringify(s));
  for (const k of keys) await page.keyboard.up(k);
  return s;
}

// The ring is only ~5.4 deep, so each sample has to be taken before the
// wrestler reaches the ropes and the rope beat takes over.
await recentre();
const walk = await hold(["w"], 700, "03-walk");

// Direction before Shift, or this would be a default-direction run.
await recentre();
const run = await hold(["w", "Shift"], 700, "04-run");

await page.waitForTimeout(500);

async function tap(key, label, delay = 350) {
  await page.keyboard.press(key);
  await page.waitForTimeout(delay);
  const s = await state();
  await shot(label);
  console.log(`${label.toUpperCase()}:`, JSON.stringify(s));
  return s;
}

const punch = await tap("j", "05-punch");
await page.waitForTimeout(1200);
const kick = await tap("k", "06-kick");
await page.waitForTimeout(1800);
const jump = await tap("l", "07-jump", 500);
await page.waitForTimeout(2000);
const after = await state();
console.log("AFTER-JUMP:", JSON.stringify(after));

// Block: P held while standing still should hold a guard, and release it.
await page.keyboard.down("p");
await page.waitForTimeout(600);
const block = await state();
await shot("08-block");
console.log("08-BLOCK:", JSON.stringify(block));
await page.keyboard.up("p");
await page.waitForTimeout(700);
const afterBlock = await state();
console.log("AFTER-BLOCK:", JSON.stringify(afterBlock));

// Roll: P pressed while sprinting should roll instead of guarding, and the
// roll must carry the character forward on its own.
// Recentre first: pinned against the ropes the roll would have nowhere to go,
// and the rope beat would swallow the P press.
await recentre();
await page.keyboard.down("w");
await page.waitForTimeout(80);
await page.keyboard.down("Shift");
await page.waitForTimeout(420);
const beforeRoll = await state();
await page.keyboard.press("p");
await page.waitForTimeout(250);
const roll = await state();
await shot("09-roll");
console.log("09-ROLL:", JSON.stringify(roll));
await page.keyboard.up("w");
await page.keyboard.up("Shift");
await page.waitForTimeout(1600);
const afterRoll = await state();
console.log("AFTER-ROLL:", JSON.stringify(afterRoll));

const dist = (a, b) =>
  a && b ? Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z) : null;

console.log("\n=== RESULT ===");
console.log("walk anim:", walk?.anim, "| run anim:", run?.anim);
console.log("punch anim:", punch?.anim, "| kick anim:", kick?.anim, "| jump anim:", jump?.anim);
console.log("block anim:", block?.anim, "-> after release:", afterBlock?.anim);
console.log("roll anim:", roll?.anim, "-> after:", afterRoll?.anim);
console.log("roll carried:", dist(beforeRoll, afterRoll)?.toFixed(2), "units");
console.log("moved:", JSON.stringify(walk?.pos), "->", JSON.stringify(run?.pos));
console.log("ERRORS:", errors.length ? errors.slice(0, 10) : "none");

await browser.close();
