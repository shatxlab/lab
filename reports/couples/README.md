# Secret Pattern browser checks

From the repo root, run `npm run build`, then start `npm run dev -- --port 4321`
and `npm run preview -- --port 4322` in separate terminals. With Playwright and
Chromium installed separately:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/couples/mini-games-browser.mjs
```

Set `PORTS=4322` for production preview only. The script checks five-round EN/RU
phone flows, private handoffs, peeks, exact scoring, replay/exit/reload, layout,
and scoped axe audits. It also checks dark mode and reduced motion. It writes
screenshots and `mini-games-browser-check.json` here; results are not a substitute
for real-device or two-person playtesting.

The Split or Steal screenshots here are historical; that game was removed.
