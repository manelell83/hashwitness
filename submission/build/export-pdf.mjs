// Exports submission/HashWitness-DigiHacks.pdf from the HTML deck (Chrome print, fonts embedded) and screenshots
// every slide as the browser shows it (build/out/html-N.png), with ALL network requests blocked and logged:
// the deck must work offline. Then compare.py checks that PDF pages and HTML slides look the same.
//   node export-pdf.mjs
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const deck = new URL("../HashWitness-DigiHacks.html", import.meta.url);
const pdf = new URL("../HashWitness-DigiHacks.pdf", import.meta.url);
const out = new URL("./out/", import.meta.url);
mkdirSync(out, { recursive: true });
const path = (u) => decodeURIComponent(u.pathname).replace(/^\/([A-Za-z]:)/, "$1");

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, offline: true });
const blocked = [];
await ctx.route("**/*", (route) => {
  const u = route.request().url();
  if (u.startsWith("file:") || u.startsWith("data:")) return route.continue();
  blocked.push(u);
  return route.abort();
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto(deck.href);
await page.evaluate(() => document.fonts.ready);
const fontOk = await page.evaluate(() => document.fonts.check('700 40px "Hanken Grotesk"'));
const n = await page.locator(".slide").count();
for (let k = 1; k <= n; k++) {
  await page.evaluate((i) => { location.hash = `#${i}`; }, k);
  await page.waitForTimeout(450); // fade
  await page.screenshot({ path: path(new URL(`html-${k}.png`, out)) });
}
// keyboard check: End then ArrowLeft lands on n-1
await page.keyboard.press("End");
await page.keyboard.press("ArrowLeft");
const counter = await page.locator(".counter").textContent();

await page.emulateMedia({ media: "print" });
await page.pdf({ path: path(pdf), width: "1920px", height: "1080px", printBackground: true, preferCSSPageSize: true });
await browser.close();

console.log(`slides: ${n}  font loaded: ${fontOk}  keyboard (End, Left): ${counter}`);
console.log(`blocked network requests: ${blocked.length ? blocked.join(", ") : "none"}`);
console.log(`page errors: ${errors.length ? errors.join(" | ") : "none"}`);
console.log(`pdf: ${path(pdf)}`);
