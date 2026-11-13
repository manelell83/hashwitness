// Assembles the single self-contained deck: submission/HashWitness-DigiHacks.html.
// Inlines the font (base64), CSS, JS, images, QR codes (SVG) and the demo video (base64). No external requests.
//   node build-deck.mjs
import { readFileSync, statSync, writeFileSync } from "node:fs";
import QRCode from "qrcode";

const here = (p) => new URL(p, import.meta.url);
const read = (p) => readFileSync(here(p), "utf8");
const b64 = (p, mime) => `data:${mime};base64,${readFileSync(here(p)).toString("base64")}`;

export const PAGES = "https://manelell83.github.io/hashwitness/";
const VIDEO_URL = `${PAGES}HashWitness-demo.mp4`;
const REPO_URL = "https://github.com/manelell83/hashwitness";

// PNG, not SVG: the QR's SVG path has thousands of segments and froze the first frame it was drawn (~350 ms).
async function qr(url, label, dark) {
  const png = await QRCode.toDataURL(url, { margin: 1, width: 360, errorCorrectionLevel: "M", color: { dark, light: "#ffffff" } });
  return `<img class="qr" src="${png}" alt="${label}: ${url}" decoding="sync">`;
}

// logo: the drawing elements of apps/web/public/logo.svg (metadata left out)
const logoSrc = readFileSync(here("../../apps/web/public/logo.svg"), "utf8");
const logoBody = logoSrc
  .replace(/^[\s\S]*?<svg\b[^>]*>/, "").replace(/<\/svg>\s*$/, "")
  .replace(/<metadata\b[\s\S]*?<\/metadata>/g, "").replace(/<c2pa:[\s\S]*?<\/c2pa:[^>]+>/g, "").replace(/<!--[\s\S]*?-->/g, "");
const LOGO = `<svg viewBox="0 0 64 64" width="60" height="60" aria-hidden="true">${logoBody}</svg>`;

let slides = read("deck/slides.html").replace(/<!--[\s\S]*?-->/g, "") // comments first: they mention placeholders
  .replace(/{{IMG:([\w-]+)}}/g, (_, n) => b64(`assets/shots/${n}.png`, "image/png"))
  .replaceAll("{{POSTER}}", b64("assets/video-poster.jpg", "image/jpeg"))
  .replaceAll("{{LOGO}}", LOGO)
  .replaceAll("{{QR:video}}", await qr(VIDEO_URL, "QR code to the demo video", "#1A0F2E"))
  .replaceAll("{{QR:repo}}", await qr(REPO_URL, "QR code to the GitHub repository", "#1A0F2E"));
const unresolved = slides.match(/{{[^}]+}}/g);
if (unresolved) throw new Error(`unresolved placeholders: ${unresolved.join(", ")}`);

const css = read("deck/palette.css") + read("deck/deck.css").replace("{{FONT}}", b64("assets/HankenGrotesk-wght.ttf", "font/ttf"))
  + read("deck/motion.css");
const video = b64("../HashWitness-demo.mp4", "video/mp4");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HashWitness · DigiHacks</title>
<meta name="description" content="HashWitness: verify Hedera data without trusting a single mirror node. Hedera Cross Campus Challenge 2026, team DigiHacks.">
<style>${css}</style>
</head>
<body>
<main class="stage" aria-roledescription="slide deck">
${slides}
</main>
<div class="progress" aria-hidden="true"></div>
<div class="dots" aria-hidden="true"></div>
<div class="counter" aria-live="polite"></div>
<div class="toast" role="status"></div>
<div class="notes" aria-label="Speaker notes"></div>
<div class="modal" role="dialog" aria-label="Demo video"><button type="button">Close (Esc)</button><video controls playsinline preload="none" poster="${b64("assets/video-poster.jpg", "image/jpeg")}" src="${video}"></video></div>
<script>${read("deck/deck.js")}</script>
</body>
</html>
`;
const out = here("../HashWitness-DigiHacks.html");
writeFileSync(out, html);
console.log(`deck: submission/HashWitness-DigiHacks.html  ${(statSync(out).size / 1e6).toFixed(1)} MB`);
const ext = html.match(/(?:src|href)=["'](?:https?:)?\/\/[^"']+/g);
console.log(ext ? `external references: ${ext.join(", ")}` : "external references: none");
