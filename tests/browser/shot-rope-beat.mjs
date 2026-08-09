import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const URL = process.env.GAME_URL || "http://localhost:8080/#combat";
const OUT = process.env.OUT_DIR || "./beat-frames";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

/**
 * Freezes the scene a set time after the wrestler meets the ropes, so the
 * 0.33s beat can be photographed. Screenshots are far slower than the beat,
 * so the render loop is stopped on the wanted frame first.
 */
async function capture(label, msAfterContact) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.click('.roster__card:has(.roster__name:text-is("Ranger"))');
  await page.waitForFunction(() => window.__game?.currentAnimation, { timeout: 60000 });
  await page.waitForTimeout(1000);

  await page.evaluate(() => {
    const g = window.__game;
    g.teleportPlayer(0, -1.2, 0);
    const c = g.scene.activeCamera;
    c.alpha = -Math.PI / 2;
    c.beta = 1.15;
    c.radius = 6.5;
  });
  await page.waitForTimeout(250);

  await page.keyboard.down("w");
  await page.waitForTimeout(80);
  await page.keyboard.down("Shift");

  const state = await page.evaluate(async (delay) => {
    const g = window.__game;
    // Wait for the rope-hit beat to begin.
    await new Promise((resolve) => {
      const tick = () => {
        if (g.currentAnimation === "Hit_Chest") return resolve();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const t0 = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        if (performance.now() - t0 >= delay) return resolve();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    g.engine.stopRenderLoop();
    return {
      z: +g.playerPosition.z.toFixed(3),
      yaw: +g.playerFacing.toFixed(3),
      bow: +g.ringRopes.displacementOf("+z").toFixed(3),
      anim: g.currentAnimation,
    };
  }, msAfterContact);

  await page.screenshot({ path: `${OUT}/${label}.png` });
  console.log(
    `${label.padEnd(16)} +${String(msAfterContact).padStart(3)}ms  z=${state.z}  yaw=${state.yaw}  bow=${state.bow}  ${state.anim}`
  );
  await page.close();
}

await capture("1-contact", 20);
await capture("2-turned", 150);
await capture("3-launch", 320);

await browser.close();
