// Regenerates the raster brand assets from assets/favicon.svg:
//   assets/icons/*.png (PWA + Apple touch icons) and assets/og-image.png (social preview).
//
// Needs a Chromium and playwright-core, neither of which is a project dependency:
//   npm i --no-save playwright-core
//   CHROME_PATH=/path/to/chrome node scripts/generate-brand-assets.mjs
// The generated PNGs are committed, so this only runs when the logo or tagline changes.
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const { chromium } = await import("playwright-core").catch(() => {
  console.error("playwright-core is not installed: npm i --no-save playwright-core");
  process.exit(1);
});

const svg = await readFile(`${root}assets/favicon.svg`, "utf8");
// The mark without its rounded-square plate, for full-bleed (maskable / Apple) icons.
const mark = svg.replace(/<rect x="2" y="2"[^>]*\/>/, "");
const GRADIENT = '<linearGradient id="ll-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#10b981"/><stop offset="1" stop-color="#047857"/></linearGradient>';

const fullBleed = (scale) => {
  const inner = mark.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/<defs>[\s\S]*?<\/defs>/, "");
  const defs = svg.match(/<defs>[\s\S]*?<\/defs>/)?.[0] ?? `<defs>${GRADIENT}</defs>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${defs}<rect width="64" height="64" fill="url(#ll-bg)"/><g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${inner}</g></svg>`;
};

const executablePath = process.env.CHROME_PATH;
const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
const page = await browser.newPage();
await mkdir(`${root}assets/icons`, { recursive: true });

for (const [name, size, markup] of [
  ["icon-192.png", 192, svg],
  ["icon-512.png", 512, svg],
  ["icon-maskable-512.png", 512, fullBleed(0.78)],
  ["apple-touch-icon.png", 180, fullBleed(0.92)],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${markup}`);
  await page.screenshot({ path: `${root}assets/icons/${name}`, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

// Social preview (Open Graph / Twitter), 1200×630.
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(`<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0}
  body{width:1200px;height:630px;font-family:Inter,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:#ecfdf5;
    background:radial-gradient(900px 500px at 85% -10%,#0f766e55,transparent),radial-gradient(700px 500px at -10% 110%,#10b98133,transparent),#0b1512;
    display:flex;flex-direction:column;justify-content:space-between;padding:68px 76px}
  .top{display:flex;align-items:center;gap:44px}
  .logo svg{width:210px;height:210px;display:block;filter:drop-shadow(0 18px 40px #05966955)}
  h1{font-size:112px;line-height:1;letter-spacing:-0.03em;font-weight:800}
  .tag{margin-top:18px;font-size:42px;line-height:1.2;color:#6ee7b7;font-weight:600}
  .chips{display:flex;flex-wrap:wrap;gap:12px}
  .chip{border:2px solid #34d39966;background:#064e3b66;color:#d1fae5;border-radius:999px;padding:9px 20px;font-size:26px;font-weight:600}
  .foot{display:flex;justify-content:space-between;font-size:28px;color:#a7f3d0aa}
</style>
<div class="top"><div class="logo">${svg}</div><div><h1>Local Lab</h1><p class="tag">Your tools. Your browser.<br>Nothing uploaded.</p></div></div>
<div class="chips"><span class="chip">PDF</span><span class="chip">Documents</span><span class="chip">Images</span><span class="chip">QR codes</span><span class="chip">Text &amp; data</span><span class="chip">Games</span></div>
<div class="foot"><span>Free · private · works offline</span><span>English · Русский</span></div>`);
await page.screenshot({ path: `${root}assets/og-image.png` });
await browser.close();
console.log("Brand assets written.");
