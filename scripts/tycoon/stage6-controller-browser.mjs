// Prepared React UI + real persistence only. Homepage host avoids the still-live v11 island/writers.
import assert from 'node:assert/strict'
import { readFileSync, mkdirSync } from 'node:fs'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const code = readFileSync('/tmp/stage6-controller-harness.js', 'utf8')
const css = readFileSync('/tmp/stage6-controller-harness.css', 'utf8')
const shots = '/tmp/tycoon-stage6-controller-shots'
mkdirSync(shots, { recursive: true })
const browser = await chromium.launch({ headless: true })
async function pageFor(context, kind) {
  const page = await context.newPage()
  await page.goto(process.env.BASE_URL ?? 'http://127.0.0.1:4322/')
  await page.setContent('<!doctype html><html><head></head><body style="margin:0"><div class="tycoon-root" id="career-test"></div></body></html>')
  await page.addStyleTag({ content: css })
  await page.addScriptTag({ content: code })
  await page.evaluate((kind) => window.CareerUIHarness.mount(kind), kind)
  await page.getByRole('dialog', { name: 'Your next chapter', exact: true }).waitFor()
  return page
}
const ready = async (page) => page.waitForFunction(() => !window.CareerUIHarness.current().busy.value)
try {
  for (const kind of ['paid', 'legacy', 'bankrupt']) for (const [width, height, large] of [[1280, 900, false], [390, 844, false], [320, 568, true]]) {
    const context = await browser.newContext({ bypassCSP: true, viewport: { width, height } })
    const page = await pageFor(context, kind), errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    if (large) await page.evaluate(() => document.querySelectorAll('.tycoon-root, .tycoon-root button, .tycoon-root input, .tycoon-root select').forEach((e) => e.style.setProperty('font-size', '28px', 'important')))
    const modal = page.getByRole('dialog', { name: 'Your next chapter', exact: true })
    assert.match(await modal.innerText(), /Spendable personal cash/)
    if (kind === 'legacy') {
      assert.match(await modal.innerText(), /Exact personal credit: \$5,000,000/)
      await page.screenshot({ path: `${shots}/${kind}-${width}.png` })
      await modal.getByRole('button', { name: 'Leave proceeds unpriced', exact: true }).click()
      await ready(page)
      assert.equal(await page.evaluate(() => window.CareerUIHarness.current().summary().value.liquid), 0)
    } else if (kind === 'bankrupt') {
      const people = await page.evaluate(() => JSON.stringify(window.CareerUIHarness.current().store.state.employees))
      await modal.getByRole('button', { name: 'Accept 30-day consulting contract', exact: true }).click()
      await ready(page)
      await modal.getByRole('button', { name: 'Work 7 days', exact: true }).click()
      await ready(page)
      assert.match(await modal.innerText(), /23 game days remaining/)
      assert.equal(await page.evaluate(() => window.CareerUIHarness.current().summary().value.liquid), 0)
      await page.screenshot({ path: `${shots}/${kind}-${width}.png` })
      await page.evaluate(() => { window.CareerUIHarness.unmount(); window.CareerUIHarness.mount('resume') })
      await page.getByText('23 game days remaining', { exact: true }).waitFor()
      await page.getByRole('button', { name: 'Finish contract (23 days)', exact: true }).click()
      await ready(page)
      assert.ok(await page.evaluate(() => window.CareerUIHarness.current().summary().value.liquid > 0))
      assert.equal(await page.evaluate(() => JSON.stringify(window.CareerUIHarness.current().store.state.employees)), people)
    } else {
      if (width === 1280) {
        const downloaded = page.waitForEvent('download')
        await modal.getByRole('button', { name: 'Export backup', exact: true }).click()
        const file = await downloaded
        await file.saveAs(`${shots}/exported-career.json`)
        const exported = JSON.parse(readFileSync(`${shots}/exported-career.json`, 'utf8'))
        assert.equal(exported.version, 12)
        assert.ok(exported.finance.records.some((r) => r.kind === 'settlement'))
      }
      await modal.getByLabel('Company name', { exact: true }).fill('Synthetic Successor')
      await modal.getByLabel('Ambition', { exact: true }).selectOption('venture')
      assert.match(await modal.innerText(), /Personal reserve after transfer/)
      assert.equal(await modal.getByRole('textbox').count(), 1, 'Only the company is named')
      const confirm = modal.getByRole('button', { name: 'Confirm investment and found company', exact: true })
      await confirm.scrollIntoViewIfNeeded()
      assert.ok(await modal.evaluate((e) => e.scrollWidth <= e.clientWidth + 1))
      await page.screenshot({ path: `${shots}/${kind}-${width}.png` })
      await confirm.click(); await ready(page)
      const next = await page.evaluate(() => ({ game: window.CareerUIHarness.current().store.state, finance: window.CareerUIHarness.current().summary().value }))
      assert.equal(next.game.studioName, 'Synthetic Successor')
      assert.equal(next.game.chapter, 2)
      assert.equal(next.game.products.length, 0)
      assert.ok(next.finance.liquid < 5_000_000)
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    assert.deepEqual(errors, [])
    await context.close()
    console.log(`Prepared career UI passed: ${kind} ${width}x${height}${large ? ' enlarged text' : ''}`)
  }
  const context = await browser.newContext({ bypassCSP: true })
  const first = await pageFor(context, 'paid'), stale = await pageFor(context, 'resume')
  for (const [page, name] of [[first, 'First successor'], [stale, 'Stale successor']]) {
    await page.getByLabel('Company name', { exact: true }).fill(name)
    await page.getByLabel('Ambition', { exact: true }).selectOption('venture')
  }
  const original = await first.evaluate(() => localStorage.getItem('lab:tycoon:save'))
  await first.evaluate(() => window.CareerUIHarness.setBlocked(true))
  await first.getByRole('button', { name: 'Confirm investment and found company', exact: true }).click()
  await ready(first)
  assert.equal(await first.evaluate(() => localStorage.getItem('lab:tycoon:save')), original)
  assert.match(await first.locator('.modal [role="alert"]').innerText(), /could not store/)
  await first.evaluate(() => window.CareerUIHarness.setBlocked(false))
  await first.getByRole('button', { name: 'Confirm investment and found company', exact: true }).click(); await ready(first)
  const successor = await first.evaluate(() => localStorage.getItem('lab:tycoon:save'))
  await stale.getByRole('button', { name: 'Confirm investment and found company', exact: true }).click(); await ready(stale)
  assert.equal(await stale.evaluate(() => localStorage.getItem('lab:tycoon:save')), successor)
  assert.match(await stale.locator('.modal [role="alert"]').innerText(), /changed in another tab/)
  await context.close()
  console.log('Prepared career UI passed: quota failure/retry preserves the ending and credits/debits once')
  console.log('Prepared career UI passed: stale second-tab confirmation cannot replace the successor')
} finally { await browser.close() }
