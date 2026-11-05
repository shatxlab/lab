// Local-only Chromium regressions for Stage 0. Generate fixtures with stage0-fixtures.ts first.
// Start the app separately: NODE_ENV=development npm run dev -- --port 4322
// Install Playwright outside the project if desired:
//   npm install --prefix /tmp/lab-browser-tools --include=dev playwright
//   /tmp/lab-browser-tools/node_modules/.bin/playwright install chromium
//   PLAYWRIGHT_MODULE=/tmp/lab-browser-tools/node_modules/playwright/index.mjs node scripts/tycoon/stage0-browser.mjs
// BASE_URL, FIXTURE_DIR, E2E_SHOTS override the local URL and /tmp output paths.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const url = process.env.BASE_URL ?? 'http://127.0.0.1:4322/tycoon/'
const fixtures = process.env.FIXTURE_DIR ?? '/tmp/tycoon-stage0-fixtures'
const shots = process.env.E2E_SHOTS ?? '/tmp/tycoon-stage0-shots'
mkdirSync(shots, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const errors = []
async function fixture(name, viewport) {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(`${name}: ${error.message}`))
  await page.addInitScript(({ save }) => {
    if (!sessionStorage.getItem('stage0-loaded')) {
      localStorage.setItem('lab:tycoon:save', save)
      localStorage.setItem('lab:tycoon:muted', 'true')
      sessionStorage.setItem('stage0-loaded', 'yes')
    }
  }, { save: readFileSync(join(fixtures, `${name}.json`), 'utf8') })
  await page.goto(url)
  await page.locator('.tycoon-root .topbar').waitFor()
  await page.locator('.scene-host canvas').waitFor()
  // Wait for textures and initial scene frames as well as React hydration.
  await page.waitForTimeout(1000)
  return { page, context }
}
async function closeGeometry(page) {
  return page.locator('.modal-footer button').evaluate((button) => {
    const r = button.getBoundingClientRect()
    const modal = button.closest('.modal')
    const body = modal.querySelector('.modal-body')
    return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, viewportW: innerWidth, viewportH: innerHeight,
      modalOverflow: modal.scrollWidth - modal.clientWidth, bodyOverflow: body.scrollWidth - body.clientWidth }
  })
}
try {
  for (const [label, viewport] of Object.entries({ desktop: { width: 1280, height: 900 }, phone: { width: 390, height: 844 }, narrow: { width: 320, height: 740 } })) {
    const { page, context } = await fixture('large-company', viewport)
    await page.getByRole('button', { name: 'Studio', exact: true }).click()
    await page.getByRole('tab', { name: 'Industry', exact: true }).click()
    const before = await closeGeometry(page)
    const tables = await page.locator('.modal-body .table-wrap').evaluateAll((wrappers) => wrappers.map((el) => {
      el.scrollLeft = el.scrollWidth
      return { width: el.clientWidth, scrollWidth: el.scrollWidth, scrollLeft: el.scrollLeft }
    }))
    if (label !== 'desktop') assert.ok(tables.some((t) => t.scrollLeft > 0), `${label}: Industry must scroll its own wide table`)
    await page.locator('.modal-body').evaluate((el) => { el.scrollTop = el.scrollHeight })
    const after = await closeGeometry(page)
    await page.screenshot({ path: join(shots, `industry-${label}.png`) })
    assert.equal(after.x, before.x, `${label}: footer moved horizontally`)
    assert.equal(after.y, before.y, `${label}: footer moved vertically`)
    assert.ok(after.x >= 0 && after.right <= after.viewportW && after.bottom <= after.viewportH, `${label}: Close outside viewport`)
    assert.ok(after.modalOverflow <= 1 && after.bodyOverflow <= 1, `${label}: dialog overflows horizontally`)
    const tabs = await page.getByRole('tab').evaluateAll((buttons) => buttons.map((b) => {
      const r = b.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    }))
    for (let i = 0; i < tabs.length; i++) for (let j = i + 1; j < tabs.length; j++) {
      const a = tabs[i], b = tabs[j]
      assert.ok(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top, `${label}: tabs overlap`)
    }
    await page.screenshot({ path: join(shots, `industry-${label}.png`) })
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    // A second pass with enlarged UI text catches min-content/flex sizing bugs.
    await page.getByRole('button', { name: 'Studio', exact: true }).click()
    await page.getByRole('tab', { name: 'Industry', exact: true }).click()
    await page.locator('.tycoon-root button, .tycoon-root table').evaluateAll((elements) => { for (const element of elements) element.style.fontSize = '20px' })
    const enlarged = await closeGeometry(page)
    assert.ok(enlarged.modalOverflow <= 1 && enlarged.bodyOverflow <= 1 && enlarged.right <= viewport.width, `${label}: enlarged text overflows`)
    console.log(`PASS ${label}: 120 employees, tabs, table scrolling, stable Close, enlarged text`)
    await context.close()
  }
  for (const name of ['cafe', 'one-floor', 'europe', 'continued']) {
    const { page, context } = await fixture(name, { width: 1280, height: 900 })
    if (name === 'continued') {
      assert.equal(await page.locator('.founding input').count(), 1)
      await page.getByRole('button', { name: 'Open the laptops' }).click()
    }
    await page.screenshot({ path: join(shots, `${name}.png`) })
    console.log(`PASS ${name}: rendered scene${name === 'continued' ? ', only company name requested' : ''}`)
    await context.close()
  }
  const { page, context } = await fixture('ipo', { width: 390, height: 844 })
  await page.getByRole('dialog', { name: 'Ready to ring the bell' }).waitFor()
  await page.screenshot({ path: join(shots, 'ipo-phone.png') })
  await page.getByRole('button', { name: 'Keep running the company' }).click()
  // Ordinary saves are coalesced/async. Wait for the real acknowledged save, not an unload-time lock race.
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('lab:tycoon:save'))?.game?.exit.ipoAcknowledged === true)
  await page.reload()
  await page.locator('.topbar').waitFor()
  assert.equal(await page.getByRole('dialog', { name: 'Ready to ring the bell' }).count(), 0)
  await page.getByRole('button', { name: 'Ring the bell · IPO', exact: true }).click()
  await page.getByRole('button', { name: 'Take the company public…', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: 'Confirm IPO and end this chapter', exact: true }).count(), 1)
  await page.getByRole('button', { name: 'Confirm IPO and end this chapter', exact: true }).click()
  await page.waitForTimeout(100)
  assert.match(await page.locator('[role="dialog"]').innerText(), /public|bell|IPO/i)
  console.log('PASS IPO: announcement, persisted dismissal, discoverable action, two-step confirmation, ending')
  await context.close()
  assert.deepEqual(errors, [], 'Uncaught browser errors')
  console.log(`All Stage 0 browser checks passed. Screenshots: ${shots}`)
} finally {
  await browser.close()
}
