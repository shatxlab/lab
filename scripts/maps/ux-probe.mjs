/* Probe the /maps route UX: fill the two endpoint fields, check the route.
   Usage: node scripts/maps/ux-probe.mjs [url] [--flow=route|category] */
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
await page.waitForTimeout(5000);

if (flow === "route") {
  // Start field: type, pick from the dropdown.
  await page.fill("#maps-start", "Тверская 7, Москва");
  await page.waitForTimeout(2500);
  await page.locator("#maps-start-list button").first().click();
  await page.waitForTimeout(2500);
  // Destination field: type, pick.
  await page.fill("#maps-end", "Арбат, Москва");
  await page.waitForTimeout(2500);
  await page.locator("#maps-end-list button").first().click();
  await page.waitForTimeout(6000);
  const summary = await page
    .locator("p[aria-live=polite]")
    .textContent()
    .catch(() => null);
  const swapEnabled = await page.getByRole("button", { name: /Swap/ }).isEnabled();
  await page.screenshot({ path: `/tmp/maps-route-${Date.now()}.png` });
  console.log("summary:", summary?.trim().slice(0, 120));
  console.log("swap enabled:", swapEnabled);
} else {
  await page.getByRole("button", { name: /Cafés/ }).click();
  for (let i = 0; i < 3; i++) {
    await page.locator(".maplibregl-ctrl-zoom-in").click();
    await page.waitForTimeout(1200);
  }
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `/tmp/maps-category-${Date.now()}.png` });
  console.log("category list items:", await page.locator("ul.max-h-40 li").count());
}

console.log("errors:", errors.length ? errors.slice(0, 10) : "none");
await browser.close();
