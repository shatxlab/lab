// Synthetic paid-company Journey regression on the real v12 island. Generate stage6-founding-fixtures.ts first.
// Paid companies require their complete career envelope; an engine-only export cannot reconstruct private finance.
import assert from 'node:assert/strict'
import { readFileSync, mkdirSync } from 'node:fs'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const shots = process.env.E2E_SHOTS ?? '/tmp/tycoon-stage6-founding-shots'
mkdirSync(shots, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  for (const ambition of ['modest', 'studio', 'venture']) for (const [width, height, large] of [[1280, 900, false], [390, 844, false], [320, 568, true]]) {
    const page = await browser.newPage({ viewport: { width, height } }), errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    const save = JSON.parse(readFileSync(`/tmp/tycoon-stage6-founding-1-${ambition}.career.json`, 'utf8'))
    await page.addInitScript((state) => { localStorage.setItem('lab:tycoon:save', JSON.stringify(state)); localStorage.setItem('lab:tycoon:muted', 'true') }, save)
    await page.goto(process.env.BASE_URL ?? 'http://127.0.0.1:4322/tycoon/')
    await page.locator('.scene-host[data-render-ready="true"] canvas').waitFor()
    const dismiss = page.getByRole('button', { name: 'Dismiss', exact: true })
    if (await dismiss.isVisible()) await dismiss.click()
    await page.getByRole('button', { name: 'Studio', exact: true }).click()
    const modal = page.getByRole('dialog', { name: 'Studio', exact: true })
    await modal.getByRole('tab', { name: 'Journey', exact: true }).click()
    if (large) await page.evaluate(() => document.querySelectorAll('.tycoon-root, .tycoon-root button, .tycoon-root input, .tycoon-root select').forEach((e) => e.style.setProperty('font-size', '28px', 'important')))
    const journey = modal.locator('.journey')
    if (ambition === 'modest') {
      assert.equal(await journey.locator('.not-applicable').count(), 0)
      assert.match(await journey.locator('.stage.current').innerText(), /Deliver 3 jobs/)
    } else {
      const skipped = journey.locator('.stage.not-applicable')
      assert.match(await skipped.innerText(), /Not applicable to this charter/)
      assert.doesNotMatch(await skipped.innerText(), /✓/)
      assert.ok(await skipped.locator('.stage-head').evaluate((e) => {
        const bounds = e.getBoundingClientRect()
        return [...e.children].every((child) => {
          const box = child.getBoundingClientRect()
          return box.left >= bounds.left - 1 && box.right <= bounds.right + 1 && child.scrollWidth <= child.clientWidth + 1
        })
      }), 'Not-applicable explanation must remain readable, including enlarged phone controls')
      assert.match(await journey.locator('.stage.current [aria-label="Charter exceptions"]').innerText(), /Ship 3 products · Not applicable to this charter/)
      assert.match(await journey.locator('.stage.current .goals').innerText(), /Make a product take off/)
      assert.doesNotMatch(await journey.locator('.stage.current .goals').innerText(), /Ship 3 products/)
    }
    assert.equal(await modal.getByRole('tab', { name: 'Products', exact: true }).count(), 1, 'Pre-hit product discovery must remain available even in a paid office')
    const rect = await modal.getByRole('button', { name: 'Close', exact: true }).boundingBox()
    assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width + 1 && rect.y + rect.height <= height + 1)
    assert.ok(await modal.evaluate((e) => e.scrollWidth <= e.clientWidth + 1))
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    assert.deepEqual(errors, [])
    await page.screenshot({ path: `${shots}/${ambition}-${width}x${height}.png` })
    await page.close()
    console.log(`Paid-start Journey passed: ${ambition} ${width}x${height}${large ? ' enlarged controls' : ''}`)
  }
} finally { await browser.close() }
