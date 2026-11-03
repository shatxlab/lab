// Generate stage1-fixtures.ts first and run the dev server on 4322 (or override BASE_URL).
// Browser setup is the same as stage0-browser.mjs. LD_LIBRARY_PATH may be needed on minimal hosts.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const url = process.env.BASE_URL ?? 'http://127.0.0.1:4322/tycoon/'
const dir = process.env.FIXTURE_DIR ?? '/tmp/tycoon-stage1-fixtures'
const shots = process.env.E2E_SHOTS ?? '/tmp/tycoon-stage1-shots'
mkdirSync(shots, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  for (const width of [1280, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addInitScript((save) => {
      localStorage.setItem('lab:tycoon:save', save)
      localStorage.setItem('lab:tycoon:muted', 'true')
    }, readFileSync(join(dir, 'business.json'), 'utf8'))
    await page.goto(url)
    await page.locator('.scene-host canvas').waitFor()
    await page.waitForTimeout(1000)
    await page.locator('astro-dev-toolbar').evaluateAll((elements) => elements.forEach((el) => el.remove()))
    await page.locator('.initiative-contract summary').first().click()
    await page.locator('.initiative-contract').first().scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(shots, `initiative-${width}.png`) })
    await page.locator('.business-panel summary').click()
    await page.locator('.business-change').scrollIntoViewIfNeeded()
    assert.match(await page.locator('.business-change').innerText(), /not all caused by this initiative/)
    assert.equal(await page.locator('.modal').count(), 0, 'informational disclosures must not open dialogs')
    assert.ok(await page.locator('.business-panel').evaluate((el) => !!el.closest('.hit-panel')))
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'page overflows')
    assert.ok(await page.locator('.hit-panel').evaluate((el) => el.scrollWidth <= el.clientWidth + 1), 'operations overflow')
    await page.screenshot({ path: join(shots, `business-${width}.png`) })
    assert.deepEqual(errors, [])
    await page.close()
    console.log(`PASS ${width}px: contracts, observed outcomes, shared scrolling, no modal/page errors or horizontal overflow`)
  }
} finally { await browser.close() }
