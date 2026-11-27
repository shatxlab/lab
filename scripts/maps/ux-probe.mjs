/* Probe the /maps route + category UX headlessly.
   Usage: node scripts/maps/probe.mjs <url> [--flow=route|category] */
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:4321/maps";
const flow = process.argv.find((a) => a.startsWith("--flow"))?.split("=")[1] ?? "route";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (err) => errors.push(`[pageerror] ${err.message.slice(0, 300)}`));
page.on("response", (res) => {
  if (res.status() >= 400) errors.push(`[http ${res.status()}] ${res.url().slice(0, 120)}`);
});

await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(6000);

if (flow === "route") {
  // Pick start from search.
  await page.fill("#maps-search", "Тверская 7, Москва");
  await page.waitForTimeout(2500);
  await page.locator("#maps-results button").first().click();
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "From here" }).click();
  const banner = await page.getByText("Now pick the destination").count();
  // Pick destination from search too.
  await page.fill("#maps-search", "Арбат, Москва");
  await page.waitForTimeout(2500);
  await page.locator("#maps-results button").first().click();
  await page.waitForTimeout(6000);
  const summary = await page.locator("span[aria-live=polite]").filter({ hasText: "→" }).textContent().catch(() => null);
  const routeLine = await page.evaluate(() => {
    const map = window.__mapsDebug?.() ?? null;
    return null;
  });
  await page.screenshot({ path: `/tmp/maps-route-${Date.now()}.png` });
  console.log("banner shown:", banner > 0);
  console.log("summary:", summary?.slice(0, 160));
} else {
  await page.getByRole("button", { name: /Cafés/ }).click();
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `/tmp/maps-category-${Date.now()}.png` });
  const list = await page.locator("ul.max-h-40 li").count();
  console.log("category list items:", list);
}

console.log("errors:", errors.length ? errors.slice(0, 10) : "none");
await browser.close();
