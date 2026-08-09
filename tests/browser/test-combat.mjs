import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const URL = process.env.GAME_URL || "http://localhost:8080/#combat";
const OUT = process.env.OUT_DIR || "./combat-shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
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

const snap = () => page.evaluate(() => window.__game.matchSnapshot());
const frame = () => page.evaluate(() => window.__game.simFrame);

const start = await snap();
console.log("player :", start.player.name, JSON.stringify({
  hp: start.player.currentHealth, max: start.player.maxHealth,
}));
console.log("opponent:", start.opponent.name, JSON.stringify({
  hp: start.opponent.currentHealth, max: start.opponent.maxHealth,
}));

check(
  "both wrestlers start at 255 health",
  start.player.currentHealth === 255 && start.opponent.currentHealth === 255 &&
    start.player.maxHealth === 255 && start.opponent.maxHealth === 255,
  `player ${start.player.currentHealth}/${start.player.maxHealth}, opponent ${start.opponent.currentHealth}/${start.opponent.maxHealth}`
);

check(
  "all joint stamina pools start at 50",
  Object.values(start.opponent.jointStamina).every((v) => v === 50),
  JSON.stringify(start.opponent.jointStamina)
);

// The simulation clock must be advancing on its own.
const f1 = await frame();
await page.waitForTimeout(600);
const f2 = await frame();
check(
  "the simulation clock advances at roughly 60Hz",
  f2 - f1 >= 25 && f2 - f1 <= 45,
  `${f2 - f1} frames in ~600ms (expect ~36)`
);

// ------------------------------------------------ punching out of range
await page.evaluate(() => window.__game.teleportPlayer(0, -2.4, 0));
await page.waitForTimeout(300);
await page.keyboard.press("j");
await page.waitForTimeout(900);
const afterMiss = await snap();
check(
  "a punch thrown from across the ring misses",
  afterMiss.opponent.currentHealth === 255 &&
    afterMiss.last && !afterMiss.last.connected,
  `opponent still ${afterMiss.opponent.currentHealth} hp; last: ${afterMiss.last?.moveName} - ${afterMiss.last?.missReason ?? "connected"}`
);

// ------------------------------------------------ punching in range
// Stand just in front of the opponent, facing them.
await page.evaluate(() => {
  const opp = window.__game.opponentPosition;
  window.__game.teleportPlayer(opp.x, opp.z - 1.0, 0);
});
await page.waitForTimeout(400);
const beforeHit = await snap();
await page.keyboard.press("j");
await page.waitForTimeout(1200);
const afterHit = await snap();

const dealt = beforeHit.opponent.currentHealth - afterHit.opponent.currentHealth;
check(
  "a punch in range deals damage",
  dealt > 0 && afterHit.last?.connected === true,
  `opponent ${beforeHit.opponent.currentHealth} -> ${afterHit.opponent.currentHealth} (${dealt} damage)`
);

const b = afterHit.last?.breakdown;
check(
  "the damage matches the four-factor formula",
  !!b && b.factor1 + b.factor2 + b.factor3 === b.subtotal &&
    b.mainHealthDamage === b.subtotal &&
    b.maxHealthDamage === Math.floor(b.mainHealthDamage / 4),
  b
    ? `F1 ${b.factor1} + F2 ${b.factor2} + F3 ${b.factor3} = ${b.subtotal}; ` +
      `main ${b.mainHealthDamage}, max ${b.maxHealthDamage}`
    : "no breakdown"
);

check(
  "max health drops by a quarter of the damage",
  afterHit.opponent.maxHealth === 255 - Math.floor(dealt / 4),
  `max ${beforeHit.opponent.maxHealth} -> ${afterHit.opponent.maxHealth}`
);

check(
  "the punch takes head joint stamina",
  afterHit.opponent.jointStamina.head < 50,
  `head stamina ${afterHit.opponent.jointStamina.head}`
);

await page.screenshot({ path: `${OUT}/01-after-punch.png` });

// ------------------------------------------------ a kick uses different parts
const beforeKick = await snap();
await page.keyboard.press("k");
await page.waitForTimeout(1800);
const afterKick = await snap();
check(
  "a kick damages the body pool instead of the head",
  afterKick.opponent.jointStamina.body < beforeKick.opponent.jointStamina.body &&
    afterKick.opponent.jointStamina.head === beforeKick.opponent.jointStamina.head,
  `body ${beforeKick.opponent.jointStamina.body} -> ${afterKick.opponent.jointStamina.body}, ` +
    `head unchanged at ${afterKick.opponent.jointStamina.head}`
);

// ------------------------------------------------ sustained exchange
for (let i = 0; i < 10; i++) {
  await page.keyboard.press("j");
  await page.waitForTimeout(1100);
}
const afterMany = await snap();
console.log("\nafter 10 more punches:", JSON.stringify({
  hp: afterMany.opponent.currentHealth,
  max: afterMany.opponent.maxHealth,
  head: afterMany.opponent.jointStamina.head.toFixed(1),
  holding: afterMany.opponent.holding,
}));

check(
  "current health never rises above max health",
  afterMany.opponent.currentHealth <= afterMany.opponent.maxHealth,
  `${afterMany.opponent.currentHealth} <= ${afterMany.opponent.maxHealth}`
);

check(
  "damage accumulates across the exchange",
  afterMany.opponent.currentHealth < afterHit.opponent.currentHealth,
  `${afterHit.opponent.currentHealth} -> ${afterMany.opponent.currentHealth}`
);

await page.screenshot({ path: `${OUT}/02-worn-down.png` });

console.log("\nrecent exchanges:");
for (const e of afterMany.history.slice(0, 5)) {
  console.log(
    `  f${String(e.frame).padStart(5)}  ${e.moveName.padEnd(14)} ` +
      (e.connected
        ? `${e.breakdown.factor1}+${e.breakdown.factor2}+${e.breakdown.factor3}=${e.breakdown.subtotal}  -${e.breakdown.currentHealthDamage}hp`
        : `miss (${e.missReason})`)
  );
}

console.log("\n=== SUMMARY ===");
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log("failed:", failed.map((f) => f.n).join("; "));
console.log("ERRORS:", errors.length ? errors.slice(0, 5) : "none");

await browser.close();
process.exit(failed.length ? 1 : 0);
