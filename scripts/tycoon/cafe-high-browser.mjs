// Local café visual acceptance. Generate stage0 fixtures first; WORKING_SAVE can supply a synthetic active-contract save.
// Same external Playwright/LD_LIBRARY_PATH setup as stage0-browser.mjs. Preview/dev URL can be overridden.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const shots = process.env.E2E_SHOTS ?? '/tmp/cafe-high-shots'
mkdirSync(shots, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript((save) => {
    localStorage.setItem('lab:tycoon:save', save)
    localStorage.setItem('lab:tycoon:muted', 'true')
  }, readFileSync(process.env.WORKING_SAVE ?? '/tmp/tycoon-stage0-fixtures/cafe.json', 'utf8'))
  await page.goto(process.env.BASE_URL ?? 'http://127.0.0.1:4323/tycoon/')
  await page.locator('.scene-host canvas').waitFor()
  await page.waitForTimeout(1000)
  await page.locator('astro-dev-toolbar').evaluateAll((elements) => elements.forEach((el) => el.remove()))
  const dismiss = page.getByRole('button', { name: 'Dismiss', exact: true })
  if (await dismiss.isVisible()) await dismiss.click()
  await page.screenshot({ path: `${shots}/cafe-desktop.png` })
  const names = JSON.parse(readFileSync(process.env.WORKING_SAVE ?? '/tmp/tycoon-stage0-fixtures/cafe.json', 'utf8')).employees.map((e) => e.name)
  for (const [i, x] of [530, 740].entries()) {
    await page.mouse.click(x, 602)
    await page.getByRole('dialog', { name: names[i], exact: true }).waitFor()
    await page.keyboard.press('Escape')
  }
  await page.getByRole('button', { name: '1×', exact: true }).click()
  await page.waitForTimeout(2200)
  await page.screenshot({ path: `${shots}/cafe-typing.png` })
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${shots}/cafe-phone.png` })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  assert.deepEqual(errors, [])
  console.log('PASS café high table: both founder hit targets, desktop/phone, live poses/screens/crowd, no page errors or page overflow')
} finally { await browser.close() }
