# Deck-free Couples games — browser evidence

This batch implements Secret Pattern and Split or Steal. Screenshots and
`mini-games-browser-check.json` come from the real React island, not fixtures
or injected app controllers. Production preview keeps the site's CSP enabled.

## Reproduce

```sh
npm run build
# Separate terminals:
npm run dev -- --port 4321
npm run preview -- --port 4322
# Playwright is not a lab dependency; use a separately installed copy:
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/couples/mini-games-browser.mjs
# Optional: PORTS=4322 to check production only.
```

- Chromium: full five-pattern and eight-round games in EN/RU at 360×640 and
  390×780 on both servers. Additional dark/reduced-motion checks at 1280×800
  and 640×360 on production preview.
- Covers, peek restoration, occupied-tile scoring, alternating choice order,
  cooperation payouts, untouched agreement stats, replay/reload, exit dialog
  focus trapping/cancel, native Enter activation, ≥44px controls, no horizontal
  overflow, no page/console errors in the full phone matrix.
- Eight scoped axe WCAG A/AA audits: pattern study/build, split choices/summary,
  plus dark pattern/split on both additional sizes; no reported violations.
- Development toolbar hidden only in dev checks because it otherwise overlays
  the narrow phone's start button. Service workers blocked so stale assets
  cannot mask a build change. Screenshots disable/finish reveal animations.

Automated browser checks are not physical-device testing or a two-person
playtest. Shared names are saved; private game state and results are not.
