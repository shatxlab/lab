// Generate stage4-family-fixtures.ts first. Real low-volume scope path, not a launch-helper bypass.
import assert from 'node:assert/strict'
import { readFileSync, mkdirSync } from 'node:fs'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const shots = process.env.E2E_SHOTS ?? '/tmp/tycoon-stage4-family-shots'
mkdirSync(shots, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  for (const width of [1280, 390, 320]) for (const family of ['cloud_platform', 'data_platform', 'xr_experience', 'small_cloud']) {
    const page = await browser.newPage({ viewport: { width, height: 900 } }), errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.addInitScript((save) => { localStorage.setItem('lab:tycoon:save', save); localStorage.setItem('lab:tycoon:muted', 'true') }, readFileSync(`/tmp/tycoon-stage4-family-${family}.json`, 'utf8'))
    await page.goto(process.env.BASE_URL ?? 'http://127.0.0.1:4322/tycoon/')
    await page.locator('.scene-host canvas').waitFor()
    const ops = page.getByLabel('Company operations', { exact: true })
    const select = ops.getByRole('combobox', { name: 'Finite initiative' })
    const companion = family === 'data_platform' ? 'ai_assistant' : family === 'xr_experience' ? 'creator_tool' : 'free_edition'
    const value = `item:companion:${companion}`
    assert.equal(await select.locator(`option[value="${value}"]`).count(), family === 'small_cloud' ? 0 : 1)
    if (family !== 'small_cloud') {
      await select.selectOption(value)
      const preview = ops.locator('.initiative-contract')
      assert.match(await preview.innerText(), /Medium-or-larger product scope or 300,000 users/)
      assert.match(await preview.innerText(), /No coverage means no flagship bonus/)
      assert.ok(await preview.evaluate((e) => e.scrollWidth <= e.clientWidth + 1), 'preview overflow')
      const dismiss = page.getByRole('button', { name: 'Dismiss', exact: true })
      if (await dismiss.isVisible()) await dismiss.click()
      await preview.scrollIntoViewIfNeeded()
      await page.screenshot({ path: `${shots}/${family}-${width}.png` })
      await ops.getByRole('button', { name: 'Assign initiative', exact: true }).click()
      await page.waitForTimeout(2300) // Normal autosave throttle, not a simulation/day shortcut.
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lab:tycoon:save')).game)
      assert.equal(saved.products[0].users, 8000)
      assert.equal(saved.offices[0].assignment.kind, 'initiative')
      assert.equal(saved.offices[0].project.itemId, `companion:${companion}`)
      assert.equal(saved.products.some((p) => p.companionId === companion), false, 'must build before receiving the product')
      assert.equal(saved.offices[1].assignment.kind, 'standing')
    }
    assert.equal(await page.getByRole('button', { name: 'Pause', exact: true }).getAttribute('aria-pressed'), 'true')
    assert.equal(await page.locator('.modal').count(), 0)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'page overflow')
    assert.ok(await ops.evaluate((e) => e.scrollWidth <= e.clientWidth + 1), 'operations overflow')
    assert.deepEqual(errors, [])
    await page.close()
    console.log(`family ${family} scope acceptance passed at ${width}px`)
  }
} finally { await browser.close() }
