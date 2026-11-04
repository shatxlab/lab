// Generate stage2-fixtures.ts and run a local production preview. Same browser setup as stage0-browser.mjs.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const base = process.env.BASE_URL ?? 'http://127.0.0.1:4322/tycoon/'
const dir = process.env.FIXTURE_DIR ?? '/tmp/tycoon-stage2-fixtures'
const shots = process.env.E2E_SHOTS ?? '/tmp/tycoon-stage2-shots'
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
    }, readFileSync(`${dir}/europe.json`, 'utf8'))
    await page.goto(base)
    await page.locator('.scene-host canvas').waitFor()
    await page.getByRole('navigation', { name: 'Delivery teams' }).waitFor()
    const dismiss = page.getByRole('button', { name: 'Dismiss', exact: true })
    if (await dismiss.isVisible()) await dismiss.click()
    assert.equal(await page.locator('.modal').count(), 0)
    await page.screenshot({ path: `${shots}/teams-${width}.png` })
    assert.match(await page.locator('.build').innerText(), /Only this team contributes/)
    await page.locator('.operations-teams button').nth(1).click()
    assert.match(await page.locator('.operations-panel').innerText(), /Assigned: reliability/)
    await page.getByRole('button', { name: 'Leave team idle', exact: true }).click()
    await page.getByRole('group', { name: 'Confirm reassignment' }).waitFor()
    assert.match(await page.getByRole('group', { name: 'Confirm reassignment' }).innerText(), /Stops reliability coverage/)
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.getByRole('button', { name: 'Leave team idle', exact: true }).click()
    await page.getByRole('button', { name: 'Confirm reassignment', exact: true }).click()
    assert.match(await page.locator('.operations-panel').innerText(), /This team is idle/)
    const select = page.locator('.operations-editor select')
    const option = await select.locator('option').evaluateAll((opts) => opts.find((o) => o.value)?.value)
    await select.selectOption(option)
    await page.getByRole('button', { name: 'Assign initiative', exact: true }).click()
    await page.locator('.build').waitFor()
    await page.locator('.business-panel summary').click()
    await page.locator('.business-panel').scrollIntoViewIfNeeded()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'page horizontal overflow')
    assert.ok(await page.locator('.operations-panel').evaluate((e) => e.scrollWidth <= e.clientWidth + 1), 'operations horizontal overflow')
    await page.screenshot({ path: `${shots}/operations-${width}.png` })
    assert.deepEqual(errors, [])
    await page.close()
    console.log(`PASS ${width}px: parallel teams, assignment preview, inline reassignment, no modal or overflow`)
  }
} finally { await browser.close() }
