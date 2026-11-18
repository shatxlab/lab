// Generate stage3-fixtures.ts first; use a local dev/preview server. Browser env matches stage2-browser.mjs.
import assert from 'node:assert/strict'
import { readFileSync, mkdirSync } from 'node:fs'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const base = process.env.BASE_URL ?? 'http://127.0.0.1:4323/tycoon/'
const shots = process.env.E2E_SHOTS ?? '/tmp/tycoon-stage3-shots'
mkdirSync(shots, { recursive: true })
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
try {
  for (const width of [1280, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.addInitScript(
      (save) => {
        localStorage.setItem('lab:tycoon:save', save)
        localStorage.setItem('lab:tycoon:muted', 'true')
      },
      readFileSync(process.env.COMPANY_SAVE ?? '/tmp/tycoon-stage3-company.json', 'utf8'),
    )
    await page.goto(base)
    await page.locator('.scene-host canvas').waitFor()
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    const dismiss = page.getByRole('button', { name: 'Dismiss', exact: true })
    if (await dismiss.isVisible()) await dismiss.click()
    await page.getByRole('button', { name: /^Team 120/ }).click()
    const panel = page.getByRole('region', {
      name: 'Company people management',
    })
    await panel.waitFor()
    assert.match(await panel.innerText(), /120 reviewed · 120 promoted · 0 deferred/)
    assert.equal(await panel.getByRole('button', { name: 'Promote', exact: true }).count(), 0)
    await panel.getByText('Review policy & payroll safeguards', { exact: true }).click()
    await panel.getByRole('spinbutton', { name: 'Monthly payroll cap' }).fill('0')
    await panel.getByRole('button', { name: 'Apply payroll cap', exact: true }).click()
    await panel.getByText('Profession coverage & lead appointments', { exact: true }).click()
    await panel.getByRole('combobox', { name: 'Lead profession' }).selectOption('engineering')
    await panel.getByRole('button', { name: 'Appoint profession lead', exact: true }).click()
    assert.match(await panel.getByRole('alert').innerText(), /Company payroll cap/)
    await panel.getByRole('spinbutton', { name: 'Monthly payroll cap' }).fill('')
    await panel.getByRole('button', { name: 'Apply payroll cap', exact: true }).click()
    await panel.getByRole('button', { name: 'Appoint profession lead', exact: true }).click()
    await panel.getByRole('button', { name: 'Release appointment', exact: true }).waitFor()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'page overflow')
    assert.ok(await panel.evaluate((e) => e.scrollWidth <= e.clientWidth + 1), 'people policy overflow')
    // The shared shell's offline-ready toast can arrive after the game has hydrated.
    await page.waitForTimeout(1000)
    if (await dismiss.isVisible()) await dismiss.click()
    await page.screenshot({ path: `${shots}/appointments-${width}.png` })
    await panel.getByText('Review policy & payroll safeguards', { exact: true }).click()
    await panel.getByText('Profession coverage & lead appointments', { exact: true }).click()
    await page.locator('.modal-body').evaluate((element) => { element.scrollTop = 0 })
    await page.screenshot({ path: `${shots}/people-${width}.png` })
    const close = page.getByRole('button', { name: 'Close', exact: true })
    await close.scrollIntoViewIfNeeded()
    assert.ok(
      await close.evaluate((e) => {
        const r = e.getBoundingClientRect()
        return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight
      }),
      'close control offscreen',
    )
    await close.click()
    assert.equal(await page.locator('.modal').count(), 0)
    assert.deepEqual(errors, [])
    await page.close()
    console.log(
      `PASS ${width}px: 120-person aggregate review, company budget guard, lead appointment, close reachable, no overflow`,
    )
  }
} finally {
  await browser.close()
}
