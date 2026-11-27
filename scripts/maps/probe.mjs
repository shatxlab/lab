/* Probe /maps in headless Chromium: collect console errors, CSP violations,
   failed requests, and a screenshot. Usage: node /tmp/maps-probe.mjs [url] */
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:4321/maps";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const errors = [];
page.on("console", (msg) => {
  const text = `[${msg.type()}] ${msg.text()}`;
  if (msg.type() === "error" || msg.type() === "warning" || /csp|blocked|error/i.test(text)) {
    errors.push(text.slice(0, 500));
  }
});
page.on("pageerror", (err) => errors.push(`[pageerror] ${err.message.slice(0, 500)}`));
page.on("requestfailed", (req) =>
  errors.push(`[requestfailed] ${req.method()} ${req.url().slice(0, 120)} — ${req.failure()?.errorText}`),
);
page.on("response", (res) => {
  if (res.status() >= 400) errors.push(`[http ${res.status()}] ${res.url().slice(0, 140)}`);
});

await page.goto(url, { waitUntil: "networkidle", timeout: 60000 }).catch((e) => errors.push(`[goto] ${e.message}`));
await page.waitForTimeout(8000);

const canvasInfo = await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  if (!canvas) return { canvas: false };
  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  return { canvas: true, w: canvas.width, h: canvas.height, gl: Boolean(gl) };
}).catch((e) => ({ evalError: e.message }));

await page.screenshot({ path: "/tmp/maps-probe.png" });
console.log("canvas:", JSON.stringify(canvasInfo));
console.log("messages:");
for (const line of [...new Set(errors)].slice(0, 40)) console.log("  " + line);
await browser.close();
