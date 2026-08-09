import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

/**
 * Drives the menu shell and control mapper against the acceptance criteria in
 * claude-main-menu-control-mapper.md.
 *
 * Everything here goes through real key events rather than clicks, because the
 * point of the virtual controller layer is that the keyboard drives the menus.
 */

const URL = process.env.GAME_URL || "http://localhost:8080/";
const OUT = process.env.OUT_DIR || "./menu-shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

const results = [];
const check = (n, p, d = "") => {
  results.push({ n, p });
  console.log(`${p ? "PASS" : "FAIL"}  ${n}${d ? `\n        ${d}` : ""}`);
};

const items = () =>
  page.$$eval(".item", (els) => els.map((e) => e.textContent.trim()));
const activeItem = () =>
  page.$eval(".item--active", (e) => e.textContent.trim()).catch(() => null);
const rowKey = (label) =>
  page.$eval(
    `.row:has(.row__label:text-is("${label}"))  .row__key`,
    (e) => e.textContent.trim()
  );
const activeRow = () =>
  page.$eval(".row--active .row__label", (e) => e.textContent.trim());

const press = async (key) => {
  await page.keyboard.press(key);
  await page.waitForTimeout(120);
};

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForSelector(".item", { timeout: 30000 });
await page.waitForTimeout(400);

// --- root menu -------------------------------------------------------------
check(
  "first screen shows the three root options",
  JSON.stringify(await items()) ===
    JSON.stringify(["Multi Play", "Single Play", "Commissioner"]),
  JSON.stringify(await items())
);

check("cursor starts on the first item", (await activeItem()) === "Multi Play");

await press("ArrowDown");
check("down moves the cursor", (await activeItem()) === "Single Play");

await press("ArrowUp");
check("up moves the cursor back", (await activeItem()) === "Multi Play");

// Left/right must not change page - the spec drops the old carousel.
const beforeLR = await items();
await press("ArrowLeft");
await press("ArrowRight");
check(
  "left and right do not change page",
  JSON.stringify(await items()) === JSON.stringify(beforeLR)
);

// --- instructions modal ----------------------------------------------------
await press("KeyZ");
const modalTitle = await page
  .$eval(".modal__title", (e) => e.textContent.trim())
  .catch(() => null);
check("Z opens the instructions panel", modalTitle === "<< Multi Play >>", String(modalTitle));
await press("KeyZ");
check(
  "Z closes it again",
  (await page.$(".modal__title")) === null
);

// --- navigating into Commissioner -----------------------------------------
await press("ArrowDown");
await press("ArrowDown");
check("cursor reaches Commissioner", (await activeItem()) === "Commissioner");

await press("Enter");
check(
  "Commissioner opens its submenu",
  JSON.stringify(await items()) ===
    JSON.stringify(["Smackdown Mall", "Options", "Arena Viewer", "Controls"]),
  JSON.stringify(await items())
);

await page.screenshot({ path: `${OUT}/01-commissioner.png` });

// --- Smackdown Mall -> Combat System Test ---------------------------------
await press("Enter");
check(
  "Smackdown Mall opens and holds Combat System Test",
  JSON.stringify(await items()) === JSON.stringify(["Combat System Test"]),
  JSON.stringify(await items())
);

await press("Escape");
check(
  "Escape from Smackdown Mall returns to Commissioner",
  (await items()).includes("Smackdown Mall")
);

// --- unimplemented target --------------------------------------------------
await press("ArrowDown");
await press("Enter");
const status = await page.$eval(".menu__status", (e) => e.textContent.trim()).catch(() => null);
check(
  "an unimplemented option reports itself instead of crashing",
  status === "Options is not implemented yet.",
  String(status)
);

// --- control mapper --------------------------------------------------------
await press("ArrowDown");
await press("ArrowDown");
check("cursor reaches Controls", (await activeItem()) === "Controls");
await press("Enter");
await page.waitForSelector(".mapper", { timeout: 5000 });

const rowCount = await page.$$eval(".row", (els) => els.length);
check(
  "mapper lists 18 bindings plus reset, export and back",
  rowCount === 21,
  `${rowCount} rows`
);

check("A defaults to Enter", (await rowKey("A")) === "Enter", await rowKey("A"));

await page.screenshot({ path: `${OUT}/02-mapper.png` });

/*
 * L and R are the controls under test throughout this section, deliberately.
 * Rebinding A or B would take away the very keys that drive the mapper, so the
 * rest of the run would be steering with keys it had just unbound.
 */
const L_ROW = 16;
for (let i = 0; i < L_ROW; i += 1) await press("ArrowDown");
check("cursor reaches the L row", (await activeRow()) === "L", await activeRow());

await press("Enter");
await press("KeyX");
check(
  "rebinding to a free key takes effect",
  (await rowKey("L")) === "X",
  await rowKey("L")
);

check(
  "the key L used to hold is released",
  (await rowKey("R")) === "E" && (await rowKey("L")) !== "Q",
  `L=${await rowKey("L")} R=${await rowKey("R")}`
);

// --- conflict path ---------------------------------------------------------
// Try to give R the key L now holds.
await press("ArrowDown");
check("cursor reaches the R row", (await activeRow()) === "R", await activeRow());
await press("Enter");
await press("KeyX");
const conflictText = await page
  .$eval(".modal__text", (e) => e.textContent.trim())
  .catch(() => null);
check(
  "a clash asks before replacing",
  conflictText === "Replace existing binding?",
  String(conflictText)
);

await page.screenshot({ path: `${OUT}/03-conflict.png` });

await press("Escape");
check(
  "cancelling the clash leaves both bindings alone",
  (await rowKey("L")) === "X" && (await rowKey("R")) === "E",
  `L=${await rowKey("L")} R=${await rowKey("R")}`
);

await press("Enter");
await press("KeyX");
await press("Enter");
check(
  "confirming the clash moves the key and unbinds the loser",
  (await rowKey("R")) === "X" && (await rowKey("L")) === "unbound",
  `L=${await rowKey("L")} R=${await rowKey("R")}`
);

// --- persistence -----------------------------------------------------------
const saved = await page.evaluate(() =>
  localStorage.getItem("vpg-control-mappings")
);
check(
  "remaps persist to localStorage under the agreed key",
  saved !== null && JSON.parse(saved).bindings.r.includes("KeyX"),
  String(saved).slice(0, 90)
);

await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector(".item", { timeout: 30000 });
await page.waitForTimeout(400);
const afterReload = await page.evaluate(() =>
  JSON.parse(localStorage.getItem("vpg-control-mappings")).bindings.r
);
check(
  "remaps survive a refresh",
  afterReload.includes("KeyX"),
  JSON.stringify(afterReload)
);

// --- reset -----------------------------------------------------------------
// The mouse path, which a player also has.
await page.click('.item:text-is("Commissioner")');
await page.click('.item:text-is("Controls")');
await page.waitForSelector(".mapper", { timeout: 5000 });
check(
  "the saved remap is in force after the refresh",
  (await rowKey("R")) === "X" && (await rowKey("L")) === "unbound",
  `L=${await rowKey("L")} R=${await rowKey("R")}`
);

await page.click('.row:has(.row__label:text-is("Reset Defaults"))');
await page.waitForTimeout(150);
check(
  "reset restores the defaults",
  (await rowKey("L")) === "Q" && (await rowKey("R")) === "E",
  `L=${await rowKey("L")} R=${await rowKey("R")}`
);
check(
  "reset clears the save",
  (await page.evaluate(() => localStorage.getItem("vpg-control-mappings"))) === null
);

// --- launching the combat test --------------------------------------------
await press("Escape");
await page.click('.item:text-is("Smackdown Mall")');
await page.click('.item:text-is("Combat System Test")');
await page.waitForSelector(".roster__card", { timeout: 30000 });
check("Combat System Test launches the existing game screen", true);

await page.screenshot({ path: `${OUT}/04-combat-test.png` });

await page.click(".overlay__back");
await page.waitForSelector(".item", { timeout: 10000 });
check(
  "the game screen returns to the menu",
  (await items()).includes("Multi Play")
);

// --- summary ---------------------------------------------------------------
console.log("\n=== SUMMARY ===");
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log("failed:", failed.map((f) => f.n).join("; "));
console.log("ERRORS:", errors.length ? errors.slice(0, 5) : "none");

await browser.close();
process.exit(failed.length || errors.length ? 1 : 0);
