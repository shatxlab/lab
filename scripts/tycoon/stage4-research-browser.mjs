// Run stage4-research-fixtures.ts first. Uses synthetic saves, never a player journal.
import assert from 'node:assert/strict'
import { readFileSync, mkdirSync } from 'node:fs'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const shots = process.env.E2E_SHOTS ?? '/tmp/tycoon-stage4-research-shots'
mkdirSync(shots, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  for (const width of [1280, 390, 320]) {
    for (const scenario of ['legacy', 'retired', 'bankrupt', 'next']) {
      const save = readFileSync(`/tmp/tycoon-stage4-research-${scenario}.json`, 'utf8')
      const page = await browser.newPage({ viewport: { width, height: 900 } }), errors = []
      page.on('pageerror', (e) => errors.push(e.message))
      await page.addInitScript((save) => { if (!sessionStorage.getItem('research-fixture-seeded')) { localStorage.setItem('lab:tycoon:save', save); localStorage.setItem('lab:tycoon:muted', 'true'); sessionStorage.setItem('research-fixture-seeded', 'true') } }, save)
      await page.goto(process.env.BASE_URL ?? 'http://127.0.0.1:4322/tycoon/')
      await page.locator('.scene-host canvas').waitFor()
      const pause = page.getByRole('button', { name: 'Pause', exact: true })
      if (scenario === 'next') {
        await page.getByRole('button', { name: 'Open the laptops', exact: true }).click()
      }
      // Saved games resume manually paused; do not toggle Pause back to running.
      assert.equal(await pause.getAttribute('aria-pressed'), 'true')
      const dismiss = page.getByRole('button', { name: 'Dismiss', exact: true })
      if (await dismiss.isVisible()) await dismiss.click()
      if (scenario === 'legacy' || scenario === 'next') {
        await page.getByRole('button', { name: /^Research(?: ·|$)/ }).click()
        const row = page.locator('.research-node').filter({ has: page.getByText('CI engineering practice', { exact: true }) })
        assert.match(await row.innerText(), scenario === 'legacy' ? /Active in this company/ : /Blueprint known — inactive in this company/)
        if (scenario === 'legacy') assert.match(await page.locator('.research-active').innerText(), /CI pipeline III/)
        const transfer = page.locator('.modal-body > details').filter({ has: page.getByText('Next-venture carry-over preview', { exact: true }) })
        await transfer.locator('summary').first().click()
      }
      if (scenario === 'retired' || scenario === 'bankrupt') {
        await page.reload()
        await page.locator('.scene-host canvas').waitFor()
      }
      const preview = page.getByRole('region', { name: 'Research carry-over preview' })
      await preview.waitFor()
      assert.match(await preview.innerText(), /completed studies survive every ending, including bankruptcy/)
      assert.match(await preview.innerText(), /normal full price and work again/)
      for (const summary of await preview.locator('summary').all()) await summary.click()
      assert.match(await preview.innerText(), /\$6,000/)
      assert.match(await preview.innerText(), /Company stage: Europe/)
      assert.match(await preview.innerText(), /Content permission stays; the design-speed practice must be re-established/)
      if (scenario === 'retired' || scenario === 'bankrupt') {
        assert.match(await preview.innerText(), /Unfinished research/)
        const proceed = page.getByRole('button', { name: 'Apply prototype settlement', exact: true })
        await proceed.scrollIntoViewIfNeeded()
        await proceed.screenshot({ path: `${shots}/${scenario}-decision-${width}.png` })
        assert.ok(await proceed.isVisible())
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'page overflow')
      assert.ok(await page.locator('.modal').evaluate((e) => e.scrollWidth <= e.clientWidth + 1), 'modal overflow')
      assert.ok(await preview.evaluate((e) => e.scrollWidth <= e.clientWidth + 1), 'transfer overflow')
      await preview.scrollIntoViewIfNeeded()
      await page.screenshot({ path: `${shots}/${scenario}-${width}.png` })
      if (scenario === 'legacy' || scenario === 'next') {
        await page.locator('.modal .actions').getByRole('button', { name: 'Close', exact: true }).click()
        assert.equal(await pause.getAttribute('aria-pressed'), 'true')
      }
      if (scenario === 'retired' || scenario === 'bankrupt') {
        if (await dismiss.isVisible()) await dismiss.click()
        await page.getByRole('button', { name: 'Apply prototype settlement', exact: true }).click()
        const fund = page.getByRole('button', { name: 'Confirm investment and found company', exact: true })
        const prepare = async () => {
          await page.getByLabel('Company name', { exact: true }).fill('Paid Research Successor')
          // Bankruptcy carries the founder alone: an ordinary developer must really be selected and paid.
          if (scenario === 'bankrupt') await page.locator('.career-hire').filter({ hasText: / · developer · / }).first().getByRole('checkbox').check()
          await page.getByRole('button', { name: 'Use minimum', exact: true }).click()
        }
        await prepare()
        for (let contract = 0; contract < 40 && await fund.isDisabled(); contract++) {
          await page.getByRole('button', { name: 'Accept 30-day consulting contract', exact: true }).click()
          await page.getByRole('button', { name: 'Finish contract (30 days)', exact: true }).click()
          await prepare() // Successful world progression invalidates the previous local hiring/funding preview.
        }
        assert.equal(await fund.isEnabled(), true, 'explicit consulting must eventually finance a minimum real start')
        const navigation = page.waitForEvent('framenavigated', (f) => f === page.mainFrame())
        await fund.click(); await navigation
        await page.locator('.scene-host[data-render-ready="true"] canvas').waitFor()
        await page.getByRole('button', { name: /^Research(?: ·|$)/ }).click()
        const row = page.locator('.research-node').filter({ has: page.getByText('CI engineering practice', { exact: true }) })
        assert.match(await row.innerText(), /Blueprint known — inactive in this company/)
        await page.reload()
        await page.locator('.scene-host canvas').waitFor()
        await page.getByRole('button', { name: /^Research(?: ·|$)/ }).click()
        assert.match(await row.innerText(), /Blueprint known — inactive in this company/)
        const career = await page.evaluate(() => JSON.parse(localStorage.getItem('lab:tycoon:save'))), saved = career.game
        assert.equal(career.version, 12)
        assert.equal(saved.gameOver, false)
        assert.equal(saved.chapter, 2)
        const investments = career.finance.records.filter((r) => r.kind === 'investment')
        assert.equal(investments.length, 1)
        assert.ok(saved.money > 0 && saved.money <= investments[0].amount)
        assert.equal(saved.founding.ambition, 'modest')
        assert.equal(saved.research.known.length, 33)
        assert.equal(saved.surveyed.length, 2)
        assert.equal(saved.research.active, null)
        assert.equal(saved.research.done.includes('ci_pipeline'), false)
        assert.equal(await pause.getAttribute('aria-pressed'), 'true')
      }
      assert.deepEqual(errors, [])
      await page.close()
      console.log(`research ${scenario} acceptance passed at ${width}px`)
    }
  }
} finally { await browser.close() }
