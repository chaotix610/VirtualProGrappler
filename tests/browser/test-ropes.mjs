import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const URL = process.env.GAME_URL || "http://localhost:8080/#combat";
const OUT = process.env.OUT_DIR || "./rope-shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

const sample = () =>
  page.evaluate(() => {
    const g = window.__game;
    const r = g?.ringRopes;
    return {
      z: g?.playerPosition?.z ?? null,
      anim: g?.currentAnimation ?? null,
      walls: r
        ? { "+z": r.displacementOf("+z"), "-z": r.displacementOf("-z"),
            "+x": r.displacementOf("+x"), "-x": r.displacementOf("-x") }
        : null,
      wallCount: r?.wallCount ?? 0,
    };
  });

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.click('.roster__card:has(.roster__name:text-is("Ranger"))');
await page.waitForFunction(() => window.__game?.currentAnimation, { timeout: 60000 });
await page.waitForTimeout(1500);

const start = await sample();
console.log("rope walls found:", start.wallCount, "(expect 4)");
console.log("at rest:", JSON.stringify(start.walls));

// Also verify the geometry itself moves, not just the spring number. Snapshot
// every vertex at rest and compare per-vertex later.
const restVertex = await page.evaluate(() => {
  const m = window.__game.scene.meshes.find((x) => x.name === "rope-north-middle-elastic");
  const p = m?.getVerticesData("position");
  return p ? Array.from(p) : null;
});

await page.keyboard.down("Shift");
await page.keyboard.down("w");

const track = [];
let peakVertexDelta = 0;
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(80);
  const s = await sample();
  track.push({ t: (i + 1) * 80, z: +s.z.toFixed(2), pz: +s.walls["+z"].toFixed(4), nz: +s.walls["-z"].toFixed(4) });

  const d = await page.evaluate((rest) => {
    const m = window.__game.scene.meshes.find((x) => x.name === "rope-north-middle-elastic");
    const p = m?.getVerticesData("position");
    if (!p || !rest) return 0;
    let max = 0;
    for (let k = 0; k < p.length; k++) {
      max = Math.max(max, Math.abs(p[k] - rest[k]));
    }
    return max;
  }, restVertex);
  peakVertexDelta = Math.max(peakVertexDelta, d);

  if (i === 9) await page.screenshot({ path: `${OUT}/rope-loaded.png` });
}
await page.keyboard.up("w");
await page.keyboard.up("Shift");

console.log("\n t(ms)   playerZ   +z bow    -z bow");
for (const p of track) {
  console.log(String(p.t).padStart(5), String(p.z).padStart(8), String(p.pz).padStart(9), String(p.nz).padStart(9));
}

// Settling: let go and watch the oscillation die.
const settle = [];
for (let i = 0; i < 14; i++) {
  await page.waitForTimeout(120);
  const s = await sample();
  settle.push(+s.walls["+z"].toFixed(4));
}

const maxPos = Math.max(...track.map((p) => p.pz));
const minPos = Math.min(...track.map((p) => p.pz));
const oscillated = maxPos > 0.01 && minPos < -0.005;

console.log("\n=== ROPE ELASTICITY ===");
console.log("max outward bow  :", maxPos.toFixed(3), "units");
console.log("max inward swing :", minPos.toFixed(3), "units (proves it springs past rest)");
console.log("south wall loaded:", Math.max(...track.map((p) => p.nz)).toFixed(3));
console.log("settling tail    :", settle.join(", "));
console.log("OSCILLATES:", oscillated ? "YES" : "NO");
console.log("geometry moved   :", peakVertexDelta > 0.01 ? `YES (${peakVertexDelta.toFixed(3)})` : "NO");
console.log("ERRORS:", errors.length ? errors.slice(0, 5) : "none");

await browser.close();
