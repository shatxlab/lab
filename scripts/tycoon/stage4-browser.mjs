// Generate stage4-fixtures.ts, then run against a local dev/preview server.
// PLAYWRIGHT_MODULE can point at an external Playwright install, as in Stage 3.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const shots = process.env.E2E_SHOTS ?? '/tmp/tycoon-stage4-shots'
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
    }, readFileSync(process.env.COMPANY_SAVE ?? '/tmp/tycoon-stage4-company.json', 'utf8'))
    await page.goto(process.env.BASE_URL ?? 'http://127.0.0.1:4322/tycoon/')
    await page.locator('.scene-host canvas').waitFor()
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    const dismiss = page.getByRole('button', { name: 'Dismiss', exact: true })
    if (await dismiss.isVisible()) await dismiss.click()
    const operations = page.getByLabel('Company operations', { exact: true })
    const health = page.getByRole('region', { name: 'Ecosystem health' })
    assert.match(await health.innerText(), /Shared reliability coverage: 0%/)
    assert.match(await health.innerText(), /1 of 2 slots free/)
    await operations.getByRole('combobox', { name: 'Finite initiative' }).selectOption('item:companion:ai_assistant')
    const contract = operations.locator('.initiative-contract')
    assert.match(await contract.innerText(), /0.25 shared reliability/)
    assert.match(await contract.innerText(), /No coverage means no flagship bonus/)
    assert.ok(await contract.getByRole('button', { name: 'Assign initiative', exact: true }).isEnabled())
    await operations.getByRole('button', { name: 'reliability', exact: true }).click()
    assert.doesNotMatch(await health.innerText(), /Shared reliability coverage: 0%/)
    assert.match(await operations.innerText(), /Assigned: reliability/)
    await operations.getByRole('combobox', { name: 'Finite initiative' }).selectOption('item:companion:ai_assistant')
    await operations.getByRole('button', { name: 'Assign initiative', exact: true }).click()
    const confirmation = page.getByRole('group', { name: 'Confirm reassignment' })
    assert.match(await confirmation.innerText(), /Stops reliability coverage immediately/)
    await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click()
    assert.equal(await page.locator('.modal').count(), 0)
    await health.scrollIntoViewIfNeeded()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'page overflow')
    assert.ok(await operations.evaluate((e) => e.scrollWidth <= e.clientWidth + 1), 'operations overflow')
    assert.ok(await contract.evaluate((e) => e.scrollWidth <= e.clientWidth + 1), 'preview overflow')
    await page.waitForTimeout(1000)
    if (await dismiss.isVisible()) await dismiss.click()
    await page.screenshot({ path: `${shots}/ecosystem-${width}.png` })
    assert.deepEqual(errors, [])
    await page.close()
    console.log(`ecosystem acceptance passed at ${width}px`)
  }
} finally { await browser.close() }
