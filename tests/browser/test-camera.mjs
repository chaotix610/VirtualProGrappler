import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const URL = process.env.GAME_URL || "http://localhost:8080/#combat";
const OUT = process.env.OUT_DIR || "./camera-shots";
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

const cam = () =>
  page.evaluate(() => {
    const c = window.__game.scene.activeCamera;
    const t = c.getTarget();
    return {
      pos: [+c.position.x.toFixed(4), +c.position.y.toFixed(4), +c.position.z.toFixed(4)],
      target: [+t.x.toFixed(4), +t.y.toFixed(4), +t.z.toFixed(4)],
    };
  });

const results = [];
const check = (n, p, d) => {
  results.push({ n, p });
  console.log(`${p ? "PASS" : "FAIL"}  ${n}\n        ${d}`);
};

const start = await cam();
console.log("camera at rest:", JSON.stringify(start));
await page.screenshot({ path: `${OUT}/01-start.png` });

// Drive the wrestler all over the ring, including rope bounces.
const samples = [start];
await page.keyboard.down("w");
await page.keyboard.down("Shift");
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(180);
  samples.push(await cam());
}
await page.screenshot({ path: `${OUT}/02-running.png` });
await page.keyboard.up("w");
await page.keyboard.up("Shift");

await page.keyboard.down("d");
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(180);
  samples.push(await cam());
}
await page.keyboard.up("d");
await page.screenshot({ path: `${OUT}/03-elsewhere.png` });

let maxDrift = 0;
for (const s of samples) {
  for (let i = 0; i < 3; i++) {
    maxDrift = Math.max(
      maxDrift,
      Math.abs(s.pos[i] - start.pos[i]),
      Math.abs(s.target[i] - start.target[i])
    );
  }
}
check(
  "camera never moves while the wrestler does",
  maxDrift === 0,
  `max drift across ${samples.length} samples: ${maxDrift}`
);

// Mouse drag must not orbit it.
await page.mouse.move(500, 300);
await page.mouse.down();
await page.mouse.move(800, 180, { steps: 12 });
await page.mouse.up();
await page.mouse.wheel(0, -600);
await page.waitForTimeout(400);
const afterDrag = await cam();
const dragDrift = Math.max(
  ...[0, 1, 2].map((i) =>
    Math.max(
      Math.abs(afterDrag.pos[i] - start.pos[i]),
      Math.abs(afterDrag.target[i] - start.target[i])
    )
  )
);
check(
  "mouse drag and wheel cannot move the camera",
  dragDrift === 0,
  `drift after drag + wheel: ${dragDrift}`
);

// Whether the ring is fully framed is judged from the screenshots; what is
// asserted here is that the camera is genuinely static.
console.log("\ncamera final:", JSON.stringify(await cam()));

console.log("\n=== SUMMARY ===");
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
console.log("ERRORS:", errors.length ? errors.slice(0, 5) : "none");

await browser.close();
process.exit(failed.length ? 1 : 0);
