// Captures REAL screenshots of the running app (pnpm demo must be running on http://localhost:5173).
// Full 1920x1080 viewport shots go to submission/screens/; 2x element crops (sharper on slides) to build/assets/shots/.
// Drives the UI by clicking, like a user. Resets the attacker mirror to Honest at the end.
//   node capture.mjs
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const APP = "http://localhost:5173";
const SCREENS = new URL("../screens/", import.meta.url);
const CROPS = new URL("./assets/shots/", import.meta.url);
mkdirSync(SCREENS, { recursive: true });
mkdirSync(CROPS, { recursive: true });
const file = (dir, name) => new URL(name, dir).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, colorScheme: "dark" });
const page = await ctx.newPage();

const nav = (label) => page.getByRole("navigation").getByRole("button", { name: label, exact: true }).click();
const full = async (name) => { await page.mouse.move(5, 5); await page.screenshot({ path: file(SCREENS, `${name}.png`), scale: "css" }); console.log("screen", name); };
const crop = async (locator, name) => { await locator.scrollIntoViewIfNeeded(); await locator.screenshot({ path: file(CROPS, `${name}.png`) }); console.log("crop  ", name); };
const settle = (ms = 600) => page.waitForTimeout(ms);

await page.goto(APP);
await page.getByRole("navigation").waitFor();
await settle(1500);

// 1. Verify DIP-002 (honest, all real mirrors)
await nav("Verify");
await page.getByRole("textbox").first().fill("DIP-002");
await page.getByRole("main").getByRole("button", { name: "Verify", exact: true }).click();
await page.locator(".report").waitFor({ timeout: 60000 });
await settle(1500);
await page.evaluate(() => window.scrollTo(0, 0));
await full("01-verify-valid");
await crop(page.locator(".verdict-card"), "verify-verdict");
await crop(page.locator(".report"), "verify-report");

// 2. Attack Lab: each attack on DIP-001
await nav("Attack Lab");
for (const [mode, label] of [["tamper", "Tamper"], ["replay", "Replay"], ["equivocate", "Equivocate"]]) {
  await page.getByRole("radio", { name: label, exact: true }).click();
  await settle(800);
  const input = page.getByRole("main").getByRole("textbox").first();
  await input.fill("DIP-001");
  await page.getByRole("main").getByRole("button", { name: "Verify", exact: true }).click();
  await page.locator(".ai-analysis").waitFor({ timeout: 60000 });
  await settle(2500); // staggered mirror rows + verdict reveal
  await page.locator(".lab").scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -140));
  await full(`02-lab-${mode}`);
  await crop(page.locator(".lab"), `lab-${mode}`);
  await crop(page.locator(".report"), `report-${mode}`);
  await crop(page.locator(".ai-analysis"), `ai-${mode}`);
  await page.evaluate(() => window.scrollTo(0, 0));
}
await page.getByRole("radio", { name: "Honest", exact: true }).click();
await settle(800);

// 3. Audit log
await nav("Audit log");
await page.locator(".log li").first().waitFor({ timeout: 60000 });
await settle(1500);
await full("03-audit-log");
await crop(page.locator(".stack"), "audit");

// 4. Metrics
await nav("Metrics");
await page.locator(".tiles").waitFor({ timeout: 30000 });
await settle(2500); // count-up
await full("04-metrics");
const cards = page.locator("main section.card");
await crop(page.locator(".tiles"), "metrics-tiles");
await crop(cards.filter({ hasText: "Cumulative query cost" }), "metrics-cost");
await crop(cards.filter({ hasText: "AI agent classification" }), "metrics-ai-matrix");
await crop(cards.filter({ hasText: "Attack classification" }).first(), "metrics-rules-matrix");

await ctx.close();
await browser.close();
