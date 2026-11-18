// Synthetic v11 engine payload inspection only; this does not enable v12 browser saves or a consulting UI.
import assert from 'node:assert/strict'
import { readFileSync, mkdirSync } from 'node:fs'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const shots = process.env.E2E_SHOTS ?? '/tmp/tycoon-stage6-career-shots'
mkdirSync(shots, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  for (const ambition of ['modest', 'studio', 'venture']) for (const health of ['ready', 'blocked']) for (const [width, height, large] of [[1280, 900, false], [390, 844, false], [320, 568, true]]) {
    const page = await browser.newPage({ viewport: { width, height } }), errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    const save = JSON.parse(readFileSync(`/tmp/tycoon-stage6-charter-${ambition}-${health}.json`, 'utf8'))
    await page.addInitScript((state) => { localStorage.setItem('lab:tycoon:save', JSON.stringify(state)); localStorage.setItem('lab:tycoon:muted', 'true') }, save)
    await page.goto(process.env.BASE_URL ?? 'http://127.0.0.1:4322/tycoon/')
    await page.locator('.scene-host[data-render-ready="true"] canvas').waitFor()
    const dismiss = page.getByRole('button', { name: 'Dismiss', exact: true })
    if (await dismiss.isVisible()) await dismiss.click()
    const keepRunning = page.getByRole('button', { name: 'Keep running the company', exact: true })
    if (await keepRunning.isVisible()) await keepRunning.click()
    await page.getByRole('button', { name: 'Studio', exact: true }).click()
    const modal = page.getByRole('dialog', { name: 'Studio', exact: true })
    await modal.getByRole('tab', { name: 'Journey', exact: true }).click()
    if (large) await page.evaluate(() => document.querySelectorAll('.tycoon-root, .tycoon-root button, .tycoon-root input, .tycoon-root select').forEach((e) => e.style.setProperty('font-size', '28px', 'important')))
    const current = modal.locator('.journey .stage.current')
    assert.match(await current.innerText(), /Charter: fit ≥50, freshness ≥60%, bug density <10/)
    assert.match(await current.innerText(), ambition === 'modest' ? /Medium-or-larger/ : ambition === 'studio' ? /Large-or-larger/ : /Flagship-or-larger/)
    const close = await modal.getByRole('button', { name: 'Close', exact: true }).boundingBox()
    assert.ok(close && close.x >= 0 && close.y >= 0 && close.x + close.width <= width + 1 && close.y + close.height <= height + 1)
    assert.ok(await modal.evaluate((e) => e.scrollWidth <= e.clientWidth + 1))
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    assert.deepEqual(errors, [])
    const healthGoal = current.locator('.goals > li').filter({ hasText: 'Charter: fit ≥50' })
    await healthGoal.scrollIntoViewIfNeeded()
    if (await dismiss.isVisible()) await dismiss.click()
    assert.ok(await healthGoal.evaluate((e) => e.scrollWidth <= e.clientWidth + 1), 'Charter labels/remedies must wrap inside Journey')
    await page.screenshot({ path: `${shots}/${ambition}-${health}-${width}x${height}.png` })
    await modal.getByRole('button', { name: 'Close', exact: true }).click()
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    const ipo = page.getByRole('dialog', { name: 'Menu', exact: true }).getByRole('button', { name: /^Go public/ })
    assert.equal(await ipo.isEnabled(), health === 'ready')
    await page.close()
    console.log(`Charter Journey/IPO passed: ${ambition} ${health} ${width}x${height}${large ? ' enlarged controls' : ''}`)
  }
} finally { await browser.close() }
