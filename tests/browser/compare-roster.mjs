import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { PNG } from "pngjs";

const URL = process.env.GAME_URL || "http://localhost:8080/#combat";
const OUT = process.env.OUT_DIR || "./roster-shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

/** Mean RGB of the centre region where the character stands. */
function meanSkin(buf) {
  const png = PNG.sync.read(buf);
  let r = 0, g = 0, b = 0, n = 0;
  const x0 = Math.floor(png.width * 0.45), x1 = Math.floor(png.width * 0.55);
  const y0 = Math.floor(png.height * 0.45), y1 = Math.floor(png.height * 0.72);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (png.width * y + x) << 2;
      const [pr, pg, pb] = [png.data[i], png.data[i + 1], png.data[i + 2]];
      // Skip the green ground and blue sky; keep skin-ish pixels.
      if (pg > pr && pg > pb) continue;
      r += pr; g += pg; b += pb; n++;
    }
  }
  return n ? { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n), n } : null;
}

const names = ["Ranger", "Sentinel", "Scout", "Vanguard"];
const results = [];

for (const name of names) {
  await page.evaluate(() => {
    const el = document.querySelector(".hud__change");
    if (el) el.click();
  });
  await page.waitForTimeout(400);
  await page.click(`.roster__card:has(.roster__name:text-is("${name}"))`);
  await page.waitForFunction(() => window.__game?.currentAnimation !== null, {
    timeout: 60000,
  });
  await page.waitForTimeout(2500);
  const buf = await page.screenshot({ path: `${OUT}/${name}.png` });
  const skin = meanSkin(buf);
  results.push({ name, skin });
  console.log(`${name.padEnd(10)} mean skin RGB=`, JSON.stringify(skin));
}

console.log("\nlight vs dark male  :", JSON.stringify(results[0].skin), "vs", JSON.stringify(results[1].skin));
console.log("light vs dark female:", JSON.stringify(results[2].skin), "vs", JSON.stringify(results[3].skin));
console.log("ERRORS:", errors.length ? errors.slice(0, 5) : "none");

await browser.close();
