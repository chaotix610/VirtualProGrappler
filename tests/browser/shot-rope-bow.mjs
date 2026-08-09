import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const URL = process.env.GAME_URL || "http://localhost:8080/#combat";
const OUT = process.env.OUT_DIR || "./bow-shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.click('.roster__card:has(.roster__name:text-is("Ranger"))');
await page.waitForFunction(() => window.__game?.currentAnimation, { timeout: 60000 });
await page.waitForTimeout(1200);

/**
 * Screenshots are far slower than the ~0.4s spring, so the scene is frozen on
 * the wanted frame first: impact, advance N frames, stop the render loop.
 * The canvas then holds that exact frame for the capture.
 */
async function freezeAt(frames, impulse) {
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.click('.roster__card:has(.roster__name:text-is("Ranger"))');
  await page.waitForFunction(() => window.__game?.currentAnimation, { timeout: 60000 });
  await page.waitForTimeout(1000);

  return page.evaluate(
    async ([n, imp]) => {
      const g = window.__game;
      // Stand the wrestler near the north ropes and look down on them, so the
      // curve of the rope is side-on to the camera.
      g.playerPositionRef.set(0, 0, 2.0);
      const cam = g.scene.activeCamera;
      cam.alpha = -Math.PI / 2;
      cam.beta = 0.85;
      cam.radius = 5.0;

      if (imp > 0) g.ringRopes.impact("+z", imp);

      await new Promise((resolve) => {
        let seen = 0;
        const tick = () => {
          if (++seen >= n) return resolve();
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });

      // Stop only. Calling scene.render() here would fire onBeforeRender and
      // step the spring again with a large accumulated delta, moving the very
      // frame we are trying to hold. The canvas already shows the last frame.
      g.engine.stopRenderLoop();
      return g.ringRopes.displacementOf("+z");
    },
    [frames, impulse]
  );
}

const rest = await freezeAt(2, 0);
await page.screenshot({ path: `${OUT}/00-rest.png` });
console.log("rest    bow:", rest.toFixed(3));

const peak = await freezeAt(3, 9);
await page.screenshot({ path: `${OUT}/01-peak.png` });
console.log("peak    bow:", peak.toFixed(3));

const recoil = await freezeAt(7, 9);
await page.screenshot({ path: `${OUT}/02-recoil.png` });
console.log("recoil  bow:", recoil.toFixed(3));

await browser.close();
