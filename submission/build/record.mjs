// Records a ~75 s silent demo video of the REAL running app (pnpm demo on http://localhost:5173), following
// scripts/demo.md. A caption bar is overlaid on top of the page to narrate each step; the app itself is untouched.
// Output: submission/HashWitness-demo.mp4 (webm from Playwright, converted with ffmpeg).
//   node record.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const APP = "http://localhost:5173";
const OUT = new URL("../HashWitness-demo.mp4", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const dir = mkdtempSync(join(tmpdir(), "hw-video-"));
const size = { width: 1920, height: 1080 };

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: size, recordVideo: { dir, size }, colorScheme: "dark" });
const page = await ctx.newPage();
const wait = (ms) => page.waitForTimeout(ms);

async function caption(step, text) {
  await page.evaluate(([s, t]) => {
    let el = document.getElementById("hw-caption");
    if (!el) {
      el = document.createElement("div");
      el.id = "hw-caption";
      el.style.cssText = "position:fixed;left:50%;bottom:36px;transform:translateX(-50%);z-index:9999;max-width:1500px;" +
        "padding:18px 32px;border-radius:999px;background:rgba(245,244,240,.96);color:#1a0f2e;font:600 30px/1.3 Montserrat,system-ui,sans-serif;" +
        "box-shadow:0 12px 40px rgba(0,0,0,.45);display:flex;gap:18px;align-items:center";
      document.body.appendChild(el);
    }
    el.innerHTML = `<span style="background:#5b2a86;color:#fff;border-radius:999px;padding:4px 16px;font-size:24px">${s}</span><span></span>`;
    el.lastChild.textContent = t;
  }, [step, text]);
}
const nav = (label) => page.getByRole("navigation").getByRole("button", { name: label, exact: true }).click();
const smoothTo = (sel, offset = -120) => page.evaluate(([s, o]) => {
  const e = document.querySelector(s);
  if (e) window.scrollTo({ top: e.getBoundingClientRect().top + window.scrollY + o, behavior: "smooth" });
}, [sel, offset]);
const verifyIn = async (id) => {
  const input = page.getByRole("main").getByRole("textbox").first();
  await input.fill("");
  await input.pressSequentially(id, { delay: 90 });
  await page.getByRole("main").getByRole("button", { name: "Verify", exact: true }).click();
};

await page.goto(APP);
await page.getByRole("navigation").waitFor();
await wait(800);

// 1. Problem framing + honest verification
await caption("1/7", "Apps read Hedera through one mirror node: plain JSON, no proof. HashWitness checks several.");
await wait(4000);
await verifyIn("DIP-002");
await page.locator(".report").waitFor({ timeout: 60000 });
await caption("1/7", "Two real testnet mirrors agree, and the hash chain ends at the consensus-node anchor: Valid.");
await wait(3000);
await smoothTo(".report");
await wait(3500);

// 2-4. Attack Lab
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
await caption("2/7", "Attack Lab: a third mirror is now controlled by an attacker.");
await nav("Attack Lab");
await wait(800);
const attacks = [
  ["Tamper", "2/7", "Tamper: the attacker mirror deletes the revocation and re-forges a valid-looking chain."],
  ["Replay", "4/7", "Replay: the attacker serves an old snapshot from before the revocation."],
  ["Equivocate", "5/7", "Equivocate: the attacker tells HashWitness the truth and lies to everyone else."],
];
for (const [label, step, text] of attacks) {
  await caption(step, text);
  await page.getByRole("radio", { name: label, exact: true }).click();
  await wait(1200);
  await verifyIn("DIP-001");
  await page.locator(".ai-analysis").waitFor({ timeout: 60000 });
  await smoothTo(".lab", -100);
  await caption(step, "Naive app trusting that mirror: Valid. HashWitness: attacker flagged, verdict Revoked.");
  await wait(5000);
  if (label === "Tamper") {
    await smoothTo(".report", -40);
    await caption("3/7", "Forensic report: exact sequence numbers altered. The AI explains; it never decides.");
    await wait(4500);
    await smoothTo(".ai-analysis", -200);
    await wait(4500);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await wait(900);
}
await page.getByRole("radio", { name: "Honest", exact: true }).click();
await wait(600);

// 5. Audit log
await nav("Audit log");
await page.locator(".log li").first().waitFor({ timeout: 60000 });
await caption("6/7", "Every verification is attested on the Hedera Consensus Service, with its report hash.");
await wait(5500);

// 6. Metrics
await nav("Metrics");
await page.locator(".tiles").waitFor({ timeout: 30000 });
await caption("7/7", "Simulation (200 scenarios): adaptive mirror selection cuts query cost by 77%, never accepted a lie.");
await wait(5000);
await smoothTo(".chart", -160);
await wait(4000);

await ctx.close();
await browser.close();

const webm = readdirSync(dir).find((f) => f.endsWith(".webm"));
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", join(dir, webm), "-c:v", "libx264", "-preset", "slow", "-crf", "26",
  "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", OUT]);
const mb = statSync(OUT).size / 1e6;
const dur = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", OUT]).toString().trim();
console.log(`video: ${OUT}  ${mb.toFixed(1)} MB  ${Number(dur).toFixed(1)} s`);
