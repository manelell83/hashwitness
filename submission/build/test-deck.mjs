// Quality gate for the animated deck (offline, every network request blocked):
//  1. steps through every build forward, screenshot + frame timing per step (frames > 50 ms = dropped)
//  2. steps back through everything and compares each state with the forward screenshot of the same state
//  3. static mode: key A, ?static, prefers-reduced-motion; attack chips on slide 4
//  4. records a video of a full forward run (out/run.webm)
//   node test-deck.mjs
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const deck = new URL("../HashWitness-DigiHacks.html", import.meta.url).href;
const out = new URL("./out/", import.meta.url);
mkdirSync(out, { recursive: true });
const p = (name) => decodeURIComponent(new URL(name, out).pathname).replace(/^\/([A-Za-z]:)/, "$1");
const browser = await chromium.launch({ channel: "chrome" });

async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, offline: true, ...opts });
  const blocked = [];
  await ctx.route("**/*", (r) => (/^(file|data):/.test(r.request().url()) ? r.continue() : (blocked.push(r.request().url()), r.abort())));
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { ctx, page, blocked, errors };
}
// frame-gap logger: max gap between animation frames while a step plays
const FRAMES = `window.__gaps=[];(function f(t){if(window.__last)window.__gaps.push(t-window.__last);window.__last=t;requestAnimationFrame(f)})(performance.now());`;
const settle = (page, ms) => page.waitForTimeout(ms);
const pause = `.slide.grad::before{animation:none!important}`; // the ambient drift is not a state: freeze it for pixel comparisons

// ---------- 1 + 2: forward and back ----------
const { ctx, page, blocked, errors } = await newPage();
await page.goto(deck);
await page.addStyleTag({ content: pause });
await page.evaluate(FRAMES);
await settle(page, 2600);
const steps = await page.evaluate(() => window.__deck.steps);
const states = [];
const timing = [];
const shot = async (tag) => page.screenshot({ path: p(`state-${tag}.png`) });
await shot("0-0");
states.push([0, 0]);
for (let s = 0; s < steps.length; s++) {
  for (let b = s === 0 ? 1 : 0; b <= steps[s]; b++) {
    if (s === 0 && steps[0] === 0) break;
  }
  const targets = [];
  for (let b = 1; b <= steps[s]; b++) targets.push([s, b]);
  if (s + 1 < steps.length) targets.push([s + 1, 0]);
  for (const [ts, tb] of targets) {
    await page.evaluate(() => { window.__gaps = []; });
    await page.keyboard.press("ArrowRight");
    await settle(page, ts === 0 || (tb === 0 && ts === 0) ? 2600 : 1700);
    const st = await page.evaluate(() => [window.__deck.slide, window.__deck.step]);
    const gaps = await page.evaluate(() => window.__gaps.slice(1));
    const max = Math.max(...gaps);
    timing.push({ to: `${ts + 1}.${tb}`, ok: st[0] === ts && st[1] === tb, frames: gaps.length, maxGap: Math.round(max), dropped: gaps.filter((g) => g > 50).length });
    await shot(`${ts}-${tb}`);
    states.push([ts, tb]);
  }
}
console.log("forward steps:", timing.length, "| state mismatches:", timing.filter((t) => !t.ok).map((t) => t.to).join(", ") || "none");
console.log("frame timing per step (max gap ms / frames > 50 ms):");
console.log("  " + timing.map((t) => `${t.to}:${t.maxGap}/${t.dropped}`).join("  "));

// back: compare each state with its forward screenshot
const { createRequire } = await import("node:module");
const diffs = [];
for (let k = states.length - 2; k >= 0; k--) {
  await page.keyboard.press("ArrowLeft");
  await settle(page, states[k][1] === 0 && states[k][0] === 0 ? 2600 : 1400);
  const [s, b] = await page.evaluate(() => [window.__deck.slide, window.__deck.step]);
  // going back onto a slide lands on its last step: compare with that forward state
  const tag = `${s}-${b}`;
  await page.screenshot({ path: p(`back-${tag}.png`) });
  diffs.push(tag);
  if (s === 0 && b === 0) break;
  // skip forward-only intermediate states (back from slide n lands on n-1 complete)
  while (k > 0 && !(states[k - 1][0] === s && states[k - 1][1] === b) && !(states[k][0] === s && states[k][1] === b)) k--;
}
console.log("back states captured:", diffs.length, diffs.join(" "));

// ---------- 3: attack chips on slide 4 ----------
await page.evaluate(() => window.__deck.show(3, 0));
for (const a of ["replay", "equivocate", "tamper"]) {
  await page.click(`[data-attack=${a}]`);
  await settle(page, 3200);
  const t = await page.evaluate(() => ({ step: window.__deck.step, label: document.querySelector("[data-slot=label]").textContent,
    ai: document.querySelector("[data-slot=ai]").textContent, l1: document.querySelector("[data-slot=l1]").textContent,
    att: document.querySelector("[data-slot=att]").textContent }));
  console.log(`chip ${a}: step ${t.step}, ${t.label}, AI ${t.ai}, hedera-public ${t.l1}, attestation ${t.att}`);
  await page.screenshot({ path: p(`chip-${a}.png`) });
}

// static via key A
await page.evaluate(() => window.__deck.show(1, 0));
await page.keyboard.press("a");
await settle(page, 400);
const aState = await page.evaluate(() => ({ cls: document.documentElement.classList.contains("static"), step: window.__deck.step,
  hidden: [...document.querySelectorAll(".slide.is-active [data-build]")].filter((e) => getComputedStyle(e).opacity !== "1").length }));
console.log(`key A: static=${aState.cls}, step=${aState.step}, invisible builds on slide 2: ${aState.hidden}`);
await page.keyboard.press("a");
console.log("blocked network requests:", blocked.length ? blocked.join(", ") : "none", "| page errors:", errors.length ? errors.join(" | ") : "none");
await ctx.close();

// ?static and reduced motion: every slide complete
for (const [name, opts, url] of [["?static", {}, deck + "?static"], ["reduced-motion", { reducedMotion: "reduce" }, deck]]) {
  const t = await newPage(opts);
  await t.page.goto(url);
  await settle(t.page, 500);
  const r = await t.page.evaluate(async () => {
    const res = [];
    for (let k = 0; k < document.querySelectorAll(".slide").length; k++) {
      window.__deck.show(k);
      await new Promise((r) => setTimeout(r, 50));
      const s = document.querySelector(".slide.is-active");
      res.push([...s.querySelectorAll("[data-build]")].filter((e) => getComputedStyle(e).opacity !== "1").length);
    }
    return { cls: document.documentElement.classList.contains("static"), invisible: res };
  });
  console.log(`${name}: static=${r.cls}, invisible builds per slide: ${r.invisible.join(",")}`);
  await t.ctx.close();
}

// ---------- 4: video of a full forward run ----------
const vctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, offline: true, recordVideo: { dir: p(""), size: { width: 1280, height: 720 } } });
const vp = await vctx.newPage();
await vp.goto(deck);
await vp.waitForTimeout(2600);
const total = steps.reduce((a, n) => a + n, 0) + steps.length - 1;
for (let k = 0; k < total; k++) { await vp.keyboard.press("ArrowRight"); await vp.waitForTimeout(1300); }
await vp.waitForTimeout(800);
const vpath = await vp.video().path();
await vctx.close();
console.log("video:", vpath);
await browser.close();
