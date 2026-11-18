// Synthetic fixtures: run stage5-workspace-fixtures.ts first. No CSP relaxation or player journals.
import assert from 'node:assert/strict'
import { readFileSync, mkdirSync } from 'node:fs'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const shots = process.env.E2E_SHOTS ?? '/tmp/tycoon-stage5-navigation-shots'
mkdirSync(shots, { recursive: true })
const cases = [1280, 390, 320].flatMap((width) => ['cafe', 'garage', 'one-floor', 'europe', 'large-company'].map((kind) => ({ width, kind, height: 900, large: false })))
for (const kind of ['cafe', 'garage', 'one-floor', 'europe', 'large-company']) cases.push({ width: 320, height: 568, kind, large: true })
async function font(page) {
  await page.evaluate(() => document.querySelectorAll('.tycoon-root, .tycoon-root button, .tycoon-root input, .tycoon-root select').forEach((e) => e.style.setProperty('font-size', '28px', 'important')))
}
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  for (const { width, height, kind, large } of cases) {
    const page = await browser.newPage({ viewport: { width, height } }), errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    const save = JSON.parse(readFileSync(`/tmp/tycoon-stage5-workspace-${kind}.json`, 'utf8'))
    const managed = kind !== 'cafe' && kind !== 'garage'
    if (managed) {
      save.chapter = 2
      save.chapterStartDay = Math.max(0, save.day - 360)
      save.legacy = [{ studio: 'Synthetic earlier venture with a deliberately long historical name', ending: 'ipo', worth: 123000000, years: 6.5 }]
      for (const rival of save.rivals) rival.name = `${rival.name} — long synthetic international competitor`
    }
    await page.addInitScript((state) => { localStorage.setItem('lab:tycoon:save', JSON.stringify(state)); localStorage.setItem('lab:tycoon:muted', 'true') }, save)
    await page.goto(process.env.BASE_URL ?? 'http://127.0.0.1:4322/tycoon/')
    await page.locator('.scene-host[data-render-ready="true"] canvas').waitFor()
    const dismiss = page.getByRole('button', { name: 'Dismiss', exact: true })
    if (await dismiss.isVisible()) await dismiss.click()
    await page.getByRole('button', { name: 'Studio', exact: true }).focus()
    await page.keyboard.press('Space')
    const modal = page.getByRole('dialog', { name: 'Studio', exact: true })
    await modal.waitFor()
    if (large) await font(page)
    assert.deepEqual(await modal.getByRole('tab').allTextContents(), managed ? ['Company', 'Industry', 'Journey'] : ['Company', 'Industry', 'Journey', 'Products'])
    async function geometry(label) {
      const close = modal.getByRole('button', { name: 'Close', exact: true })
      const rect = await close.boundingBox()
      assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width + 1 && rect.y + rect.height <= height + 1, `${label}: Close outside viewport`)
      assert.ok(await modal.evaluate((e) => e.scrollWidth <= e.clientWidth + 1), `${label}: modal overflow`)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: page overflow`)
    }
    await modal.getByRole('tab', { name: 'Company', exact: true }).click()
    await modal.locator('summary').filter({ hasText: /^Company metrics & history$/ }).focus()
    await page.keyboard.press('Space')
    await modal.locator('.stats').waitFor()
    if (large) await font(page)
    await modal.getByRole('button', { name: 'Table', exact: true }).click()
    await geometry('Company metrics/table')
    await modal.getByRole('tab', { name: 'Industry', exact: true }).click()
    await modal.locator('.industry').waitFor()
    if (large) await font(page)
    assert.ok(await modal.locator('.table-wrap').count() >= 1)
    await geometry('Industry')
    await modal.getByRole('tab', { name: 'Journey', exact: true }).focus()
    await page.keyboard.press('Space')
    await modal.locator('summary').filter({ hasText: /^Milestones & rewards$/ }).click()
    await modal.locator('.milestones').waitFor()
    await modal.locator('summary').filter({ hasText: /^Company chapters$/ }).click()
    await modal.getByText('Historical valuations are not founder cash or proceeds available to invest.', { exact: true }).waitFor()
    if (large) await font(page)
    assert.match(await modal.innerText(), /Historical valuations are not founder cash/)
    await geometry('Journey')
    await modal.getByRole('button', { name: 'Close', exact: true }).click()
    if (managed) {
      const before = await page.locator('.scene-host').boundingBox()
      await page.getByRole('button', { name: 'Studio', exact: true }).click()
      await modal.locator('summary').filter({ hasText: /^Products & ecosystem$/ }).click()
      await modal.locator('.products').waitFor()
      if (large) await font(page)
      await geometry('Ecosystem')
      assert.equal(await modal.getByRole('button', { name: 'Start project', exact: true }).count(), 0)
      await modal.getByRole('button', { name: /^Operate / }).first().click()
      assert.equal(await page.getByRole('dialog').count(), 0)
      assert.equal(await page.locator('.operations-panel > label select').inputValue(), String(save.products[0].id))
      const after = await page.locator('.scene-host').boundingBox()
      for (const dimension of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(before[dimension] - after[dimension]) < 2, `Studio navigation changed ${dimension}`)
      await page.getByRole('button', { name: /^Team \d/ }).focus()
      await page.keyboard.press('Space')
      const people = page.getByRole('dialog')
      if (large) await font(page)
      assert.equal(await people.getByRole('combobox', { name: /^Team for / }).count(), 0)
      assert.equal(await people.getByRole('combobox', { name: /^Delivery team for / }).count(), save.offices.length > 1 ? save.employees.length : 0)
      await people.getByRole('button', { name: 'Close', exact: true }).click()
    }
    assert.equal(await page.getByRole('button', { name: 'Pause', exact: true }).getAttribute('aria-pressed'), 'true')
    assert.deepEqual(errors, [])
    await page.screenshot({ path: `${shots}/${kind}-${width}x${height}${large ? '-large' : ''}.png` })
    await page.close()
    console.log(`Studio/navigation passed: ${kind} ${width}x${height}${large ? ' enlarged controls' : ''}`)
  }
} finally { await browser.close() }
