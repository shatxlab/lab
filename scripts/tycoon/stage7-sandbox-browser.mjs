// Run a development server separately, e.g. NODE_ENV=development npm run dev -- --port 4323.
// A dev shortcut must not read/adopt/write the actual save, even through menus, audio or pagehide.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const source = '{"version":99,"keep":"real-career-original"}'
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const page = await browser.newPage(), errors = []; page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript((source) => { localStorage.setItem('lab:tycoon:save', source); localStorage.setItem('lab:tycoon:muted', 'true') }, source)
  await page.goto(process.env.SANDBOX_URL ?? 'http://127.0.0.1:4323/tycoon/?garage&money=100000')
  await page.locator('.scene-host[data-render-ready="true"] canvas').waitFor()
  await page.locator('.tycoon-root').getByRole('button', { name: 'Menu', exact: true }).click()
  assert.match(await page.getByRole('dialog', { name: 'Menu', exact: true }).innerText(), /Non-persistent developer preview/)
  assert.equal(await page.getByRole('button', { name: 'New game', exact: true }).isDisabled(), true)
  assert.equal(await page.getByRole('button', { name: 'Import save…', exact: true }).isDisabled(), true)
  await page.getByRole('button', { name: /^Sound: / }).click()
  // Exercise even the hidden input's fallback handler, independently of the disabled normal entry button.
  await page.locator('input[type=file]').setInputFiles({ name: 'unsupported.json', mimeType: 'application/json', buffer: Buffer.from('{"version":12}') })
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  assert.equal(await page.evaluate(() => localStorage.getItem('lab:tycoon:save')), source)
  assert.equal(await page.evaluate(() => localStorage.getItem('lab:tycoon:muted')), 'true')
  assert.deepEqual(errors, [])
  console.log('PASS actual developer island sandbox: no adoption/autosave/import/reset/audio/pagehide writes to real storage')
} finally { await browser.close() }
