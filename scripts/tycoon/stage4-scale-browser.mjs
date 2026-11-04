// Generate stage4-scale-fixtures.ts and run against a local production preview.
import assert from 'node:assert/strict'
import { readFileSync, mkdirSync } from 'node:fs'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const save = readFileSync(process.env.COMPANY_SAVE ?? '/tmp/tycoon-stage4-scale.json', 'utf8')
const shots = process.env.E2E_SHOTS ?? '/tmp/tycoon-stage4-scale-shots'
mkdirSync(shots, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  for (const width of [1280, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.addInitScript((save) => {
      localStorage.setItem('lab:tycoon:save', save)
      localStorage.setItem('lab:tycoon:muted', 'true')
    }, save)
    await page.goto(process.env.BASE_URL ?? 'http://127.0.0.1:4322/tycoon/')
    await page.locator('.scene-host canvas').waitFor()
    const pause = page.getByRole('button', { name: 'Pause', exact: true })
    await pause.click()
    const dismiss = page.getByRole('button', { name: 'Dismiss', exact: true })
    if (await dismiss.isVisible()) await dismiss.click()
    const ops = page.getByLabel('Company operations', { exact: true })
    const readiness = page.getByLabel('Company scale readiness', { exact: true })
    await readiness.locator('summary').click()
    assert.match(await readiness.innerText(), /Provision servers for 3,000,000 users/)
    assert.match(await readiness.innerText(), /Cover current flagship and companion reliability demand/)
    assert.match(await readiness.innerText(), /Staff effective capacity in Europe/)
    assert.doesNotMatch(await readiness.innerText(), /36 people|24 people/)
    const rivalry = page.getByLabel('Rivalry decision', { exact: true })
    assert.match(await rivalry.innerText(), /campaign costs \$/)
    assert.match(await rivalry.innerText(), /not a floor build/)
    const strike = rivalry.getByRole('button', { name: /^Strike back ·/ })
    await strike.click()
    assert.ok(await strike.isDisabled())
    assert.match(await rivalry.innerText(), /Wait \d+ more day/)
    assert.equal(await pause.getAttribute('aria-pressed'), 'true')
    assert.equal(await page.locator('.modal').count(), 0)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'page overflow')
    assert.ok(await readiness.evaluate((e) => e.scrollWidth <= e.clientWidth + 1), 'readiness overflow')
    assert.ok(await ops.evaluate((e) => e.scrollWidth <= e.clientWidth + 1), 'operations overflow')
    await readiness.locator('summary').scrollIntoViewIfNeeded()
    await page.waitForTimeout(1000)
    if (await dismiss.isVisible()) await dismiss.click()
    await page.screenshot({ path: `${shots}/readiness-${width}.png` })
    assert.deepEqual(errors, [])
    await page.close()
    console.log(`scale readiness acceptance passed at ${width}px`)
  }
} finally { await browser.close() }
