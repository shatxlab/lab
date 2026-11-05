// Actual built /tycoon/ island, production CSP, real Web Locks. No injected app bundle/controller or bypassCSP.
// Run stage7-fixtures.ts first; fixture states are synthetic, separate from economic acceptance.
import assert from 'node:assert/strict'
import { readFileSync, mkdirSync } from 'node:fs'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const url = process.env.BASE_URL ?? 'http://127.0.0.1:4322/tycoon/'
const shots = '/tmp/tycoon-stage7-shots'; mkdirSync(shots, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const errors = []
const raw = (kind) => readFileSync(`/tmp/tycoon-stage7-${kind}.json`, 'utf8')
async function setup(kind, viewport = { width: 1280, height: 900 }, mode = '') {
  const context = await browser.newContext({ viewport })
  await context.addInitScript(({ source, mode }) => {
    window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective}: ${e.blockedURI}`))
    if (!localStorage.getItem('__stage7_seeded')) {
      if (source !== null) localStorage.setItem(mode === 'standalone' ? 'software-tycoon:save' : 'lab:tycoon:save', source)
      localStorage.setItem('lab:tycoon:muted', 'true'); localStorage.setItem('__stage7_seeded', 'yes')
    }
    if (mode === 'no-lock') Object.defineProperty(navigator, 'locks', { value: undefined })
    const get = Storage.prototype.getItem
    if (mode === 'blocked-read') {
      window.__originalRead = () => get.call(localStorage, 'lab:tycoon:save')
      Storage.prototype.getItem = function(k) { if (k === 'lab:tycoon:save') throw new DOMException('Blocked', 'SecurityError'); return get.call(this, k) }
    }
    const set = Storage.prototype.setItem
    Storage.prototype.setItem = function(k, v) {
      if (window.__blockCareerWrite && k === 'lab:tycoon:save') throw new DOMException('Synthetic quota', 'QuotaExceededError')
      return set.call(this, k, v)
    }
  }, { source: kind === null ? null : kind.startsWith('{') ? kind : raw(kind), mode })
  const page = await context.newPage(); page.on('pageerror', (e) => errors.push(e.message)); await page.goto(url)
  return { context, page }
}
const saved = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('lab:tycoon:save')))
const text = (p) => p.evaluate(() => localStorage.getItem('lab:tycoon:save'))
const rendered = (p) => p.locator('.scene-host[data-render-ready="true"] canvas').waitFor()
const chapter = (p) => p.getByRole('dialog', { name: 'Your next chapter', exact: true })
async function checked(page, label) {
  assert.deepEqual(await page.evaluate(() => window.__csp), [], `${label}: CSP violations`)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: page overflow`)
  const modal = page.locator('.modal'); if (await modal.count()) assert.ok(await modal.evaluate((e) => e.scrollWidth <= e.clientWidth + 1), `${label}: modal overflow`)
  await page.screenshot({ path: `${shots}/${label}.png` })
  console.log(`PASS production island: ${label}`)
}
try {
  {
    const { context, page } = await setup(null)
    await page.getByLabel('Your name', { exact: true }).fill('Alex Durable')
    await page.getByLabel('The studio', { exact: true }).fill('First Real Career')
    await page.getByRole('button', { name: 'Open the laptops', exact: true }).click()
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('lab:tycoon:save')).game.studioName === 'First Real Career')
    await page.reload(); await rendered(page)
    assert.equal((await saved(page)).version, 12)
    assert.equal(await page.getByRole('dialog').count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Pause', exact: true }).getAttribute('aria-pressed'), 'true')
    await checked(page, 'new-career-naming-reload'); await context.close()
  }
  for (const [width, height, large] of [[1280, 900, false], [390, 844, false], [320, 568, true]]) {
    const { context, page } = await setup('paid', { width, height }); await rendered(page); await chapter(page).waitFor()
    if (large) await page.evaluate(() => document.querySelectorAll('.tycoon-root, .tycoon-root button, .tycoon-root input, .tycoon-root select').forEach((e) => e.style.setProperty('font-size', '28px', 'important')))
    const dl = page.waitForEvent('download'); await chapter(page).getByRole('button', { name: 'Export backup', exact: true }).click()
    const download = await dl; await download.saveAs(`${shots}/export-${width}.json`)
    assert.equal(JSON.parse(readFileSync(`${shots}/export-${width}.json`, 'utf8')).version, 12)
    await chapter(page).getByLabel('Company name', { exact: true }).fill('Paid Successor')
    await chapter(page).getByLabel('Ambition', { exact: true }).selectOption('venture')
    await checked(page, `founding-preview-${width}`)
    const before = await saved(page), founder = before.game.employees.find((e) => e.founder && e.role === 'analyst').name
    const navigation = page.waitForEvent('framenavigated', (f) => f === page.mainFrame())
    await chapter(page).getByRole('button', { name: 'Confirm investment and found company', exact: true }).click()
    await navigation; await rendered(page)
    assert.equal((await saved(page)).game.studioName, 'Paid Successor')
    const next = await saved(page), investment = next.finance.records.filter((r) => r.kind === 'investment')
    assert.equal(investment.length, 1); assert.equal(investment[0].amount, 1000000)
    assert.equal(next.game.offices.length, 1); assert.equal(next.game.offices[0].kind, 'office')
    assert.equal(next.game.offices[0].region, 'us'); assert.equal(next.game.products.length, 0)
    assert.equal(next.game.employees.find((e) => e.founder && e.role === 'analyst').name, founder)
    assert.equal(next.game.research.done.includes('ci_pipeline'), false)
    assert.ok(next.game.research.known.includes('ci_pipeline'))
    assert.equal(await page.getByRole('dialog').count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Pause', exact: true }).getAttribute('aria-pressed'), 'true')
    await checked(page, `paid-found-remounted-scene-${width}`)
    await page.reload(); await rendered(page); assert.equal((await saved(page)).finance.records.filter((r) => r.kind === 'investment').length, 1)
    await context.close()
  }
  {
    const { context, page } = await setup('bankrupt'); await chapter(page).waitFor()
    const before = await saved(page)
    await page.getByRole('button', { name: 'Accept 30-day consulting contract', exact: true }).click()
    await page.getByRole('button', { name: 'Work 7 days', exact: true }).click()
    await page.getByText('23 game days remaining', { exact: true }).waitFor()
    await page.reload(); await chapter(page).waitFor(); await page.getByText('23 game days remaining', { exact: true }).waitFor()
    assert.equal((await saved(page)).finance.records.filter((r) => r.kind === 'consulting-complete').length, 0)
    await page.getByRole('button', { name: 'Finish contract (23 days)', exact: true }).click()
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('lab:tycoon:save')).finance.records.some((r) => r.kind === 'consulting-complete'))
    const after = await saved(page)
    assert.equal(after.game.day - before.game.day, 30)
    for (const key of ['employees', 'products', 'research', 'money', 'ending']) assert.deepEqual(after.game[key], before.game[key], key)
    await checked(page, 'consulting-partial-reload-full-payout'); await context.close()
  }
  for (const choice of ['Apply prototype settlement', 'Leave proceeds unpriced']) {
    const { context, page } = await setup('legacy'); await chapter(page).waitFor()
    assert.match(await chapter(page).innerText(), /Exact personal credit: \$5,000,000/)
    const decision = page.getByRole('button', { name: choice, exact: true }); await decision.click()
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('lab:tycoon:save')).finance.records.length === 2)
    const before = await text(page); await page.reload(); await chapter(page).waitFor()
    assert.equal(await text(page), before); assert.equal(await page.getByRole('button', { name: choice, exact: true }).count(), 0)
    assert.match(await chapter(page).innerText(), /Historical company valuations/)
    await checked(page, choice.startsWith('Apply') ? 'legacy-once-only-apply' : 'legacy-unpriced-no-grant'); await context.close()
  }
  {
    const { context, page } = await setup('paid'); await chapter(page).waitFor()
    await chapter(page).getByLabel('Company name', { exact: true }).fill('Quota Retry')
    const before = await text(page); await page.evaluate(() => { window.__blockCareerWrite = true })
    await page.getByRole('button', { name: 'Confirm investment and found company', exact: true }).click()
    await chapter(page).getByRole('button', { name: 'Retry save', exact: true }).waitFor()
    assert.equal(await text(page), before)
    assert.equal(await chapter(page).getByLabel('Company name', { exact: true }).inputValue(), 'Quota Retry')
    await checked(page, 'quota-failure-preserves-source-and-draft')
    await page.evaluate(() => { window.__blockCareerWrite = false })
    await page.getByRole('button', { name: 'Confirm investment and found company', exact: true }).click()
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('lab:tycoon:save')).game.chapter === 2)
    await rendered(page); await context.close()
  }
  {
    const { context, page } = await setup('paid'); await chapter(page).waitFor()
    const second = await context.newPage(); second.on('pageerror', (e) => errors.push(e.message)); await second.goto(url); await chapter(second).waitFor()
    for (const [p, name] of [[page, 'Winning Tab'], [second, 'Stale Tab']]) await chapter(p).getByLabel('Company name', { exact: true }).fill(name)
    await page.getByRole('button', { name: 'Confirm investment and found company', exact: true }).click()
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('lab:tycoon:save')).game.chapter === 2)
    const winner = await text(page)
    await second.getByRole('button', { name: 'Confirm investment and found company', exact: true }).click()
    await chapter(second).getByRole('button', { name: 'Reload saved career', exact: true }).waitFor()
    assert.equal(await text(second), winner)
    await checked(second, 'stale-tab-cannot-overwrite-winner'); await context.close()
  }
  {
    const { context, page } = await setup('ipo'); await rendered(page)
    await page.getByRole('dialog', { name: 'Ready to ring the bell', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Take the company public…', exact: true }).click()
    await page.getByRole('button', { name: 'Confirm IPO and end this chapter', exact: true }).click()
    await chapter(page).waitFor(); const after = await saved(page)
    assert.equal(after.game.ending.kind, 'ipo'); assert.equal(after.finance.records.filter((r) => r.kind === 'settlement').length, 2)
    assert.ok(after.finance.records.some((r) => r.kind === 'charter-fulfilled'))
    await page.reload(); await chapter(page).waitFor(); assert.deepEqual((await saved(page)).finance, after.finance)
    await checked(page, 'native-IPO-durable-settlement-reload'); await context.close()
  }
  for (const [source, mode, label] of [['{bad', '', 'corrupt'], ['{"version":99}', '', 'future-version'], ['paid', 'no-lock', 'missing-lock']]) {
    const { context, page } = await setup(source, { width: 320, height: 568 }, mode)
    await page.getByRole('region', { name: 'Career recovery', exact: true }).waitFor()
    const original = await text(page); assert.equal(original, source === 'paid' ? raw('paid') : source)
    assert.equal(await page.locator('.topbar, .scene-host canvas').count(), 0)
    const dl = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export original file', exact: true }).click()
    const file = await dl; await file.saveAs(`${shots}/${label}-original.json`); assert.equal(readFileSync(`${shots}/${label}-original.json`, 'utf8'), original)
    await checked(page, `recovery-${label}`)
    if (label === 'corrupt') {
      await page.getByRole('button', { name: 'Start a separate new career', exact: true }).click()
      assert.equal(await text(page), original)
      await page.getByRole('button', { name: 'Confirm: replace the saved career', exact: true }).click()
      await page.getByRole('button', { name: 'Open the laptops', exact: true }).waitFor()
      assert.equal((await saved(page)).version, 12)
    }
    await context.close()
  }
  {
    const { context, page } = await setup('fresh'); await rendered(page)
    const backup = raw('paid'); await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await page.locator('input[type=file]').setInputFiles({ name: 'career.json', mimeType: 'application/json', buffer: Buffer.from(backup) })
    await chapter(page).waitFor(); assert.equal(await text(page), backup)
    await checked(page, 'menu-import-replaces-through-owner')
    await page.getByRole('button', { name: 'Start a separate new career', exact: true }).click()
    assert.equal(await text(page), backup)
    await page.getByRole('button', { name: 'Confirm: discard this career', exact: true }).click()
    await page.getByRole('button', { name: 'Open the laptops', exact: true }).waitFor()
    assert.equal((await saved(page)).finance.records.length, 1)
    await checked(page, 'explicit-reset-separate-career'); await context.close()
  }
  {
    const { context, page } = await setup('fresh', { width: 390, height: 844 }, 'standalone'); await rendered(page)
    assert.equal((await saved(page)).version, 12)
    assert.equal(await page.evaluate(() => localStorage.getItem('software-tycoon:save')), raw('fresh'))
    await checked(page, 'standalone-adoption-retains-original'); await context.close()
  }
  {
    const { context, page } = await setup('paid', { width: 390, height: 844 }, 'blocked-read')
    await page.getByRole('region', { name: 'Career recovery', exact: true }).waitFor()
    assert.equal(await page.evaluate(() => window.__originalRead()), raw('paid'))
    assert.equal(await page.getByRole('button', { name: 'Start a separate new career', exact: true }).count(), 0)
    assert.equal(await page.locator('.scene-host canvas').count(), 0)
    await checked(page, 'blocked-storage-no-fallback-or-reset'); await context.close()
  }
  assert.deepEqual(errors, [], 'uncaught production browser errors')
  console.log(`All production v12 acceptance checks passed. Screenshots: ${shots}`)
} finally { await browser.close() }
