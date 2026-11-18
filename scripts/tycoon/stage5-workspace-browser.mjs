// Generate stage5-workspace-fixtures.ts first. Browser geometry is the layout acceptance gate.
import assert from 'node:assert/strict'
import { readFileSync, mkdirSync } from 'node:fs'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const shots = process.env.E2E_SHOTS ?? '/tmp/tycoon-stage5-workspace-shots'
mkdirSync(shots, { recursive: true })
const cases = [1280, 390, 320].flatMap((width) => ['cafe', 'cafe-contract', 'garage', 'garage-build', 'one-floor', 'europe', 'large-company'].map((kind) => ({ width, kind, largeFont: false })))
for (const width of [1280, 320]) for (const kind of ['europe', 'large-company']) cases.push({ width, kind, largeFont: true })
async function stressFont(page) {
  // CSSOM properties work under the site's CSP; do not bypass or relax the production policy.
  await page.evaluate(() => document.querySelectorAll('.tycoon-root, .tycoon-root button, .tycoon-root input, .tycoon-root select').forEach((e) => e.style.setProperty('font-size', '28px', 'important')))
}
for (const kind of ['europe', 'large-company']) cases.push({ width: 320, height: 568, kind, largeFont: true })
for (const kind of ['cafe', 'cafe-contract', 'garage', 'garage-build', 'one-floor']) cases.push({ width: 320, height: 568, kind, largeFont: true })
const selectedCases = process.env.SHORT_ONLY === '1' ? cases.filter((c) => c.height === 568) : cases
// Resume a long software-rendered geometry matrix after an external runner timeout; no assertion is skipped within a case.
const activeCases = selectedCases.slice(Number(process.env.CASE_START ?? 0))
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  for (const { width, kind, largeFont, height = 900 } of activeCases) {
    const page = await browser.newPage({ viewport: { width, height } }), errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.addInitScript((save) => { localStorage.setItem('lab:tycoon:save', save); localStorage.setItem('lab:tycoon:muted', 'true') }, readFileSync(`/tmp/tycoon-stage5-workspace-${kind}.json`, 'utf8'))
    await page.goto(process.env.BASE_URL ?? 'http://127.0.0.1:4322/tycoon/')
    const canvas = page.locator('.scene-host canvas')
    await page.locator('.scene-host[data-render-ready="true"] canvas').waitFor()
    if (largeFont) {
      await stressFont(page)
      assert.equal(await page.locator('.topbar-actions button').first().evaluate((e) => getComputedStyle(e).fontSize), '28px')
    }
    const company = kind === 'europe' || kind === 'large-company'
    assert.equal(await page.locator('.company-overview').count(), company ? 1 : 0)
    assert.equal(await page.locator('.floor-back, .office-tabs').count(), 0)
    const scene = page.locator('.scene-host')
    const before = await scene.boundingBox()
    assert.ok(before.width > 0 && before.height >= (company ? 180 : Math.min(180, height * .24) - 1), 'scene is crushed')
    if (company) {
      const workspace = page.getByRole('region', { name: 'Operating workspace', exact: true })
      const right = await workspace.boundingBox()
      assert.ok(right.height >= 120, 'operations are hidden/crushed by the overview or toolbar')
      if (width >= 960) {
        assert.ok(right.x >= before.x + before.width - 2, 'desktop operations must be beside the building')
        assert.ok(Math.abs(right.y - before.y) <= 2, 'desktop columns must align')
      } else {
        assert.ok(right.y >= before.y + before.height - 2, 'phone operations must be below the compact overview')
        assert.ok(before.height <= 280, 'phone overview is not compact')
      }
      await canvas.evaluate((e) => { e.dataset.workspaceIdentity = 'stable' })
      const teams = page.getByRole('navigation', { name: 'Delivery teams' })
      await teams.locator('button').last().focus()
      await page.keyboard.press('Space')
      const selectedFloor = page.locator('.building-floor[aria-pressed="true"]')
      await selectedFloor.waitFor()
      assert.equal(await selectedFloor.count(), 1)
      await selectedFloor.click()
      const after = await scene.boundingBox()
      for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(before[key] - after[key]) < 2, `floor selection changes scene ${key}`)
      assert.equal(await canvas.getAttribute('data-workspace-identity'), 'stable')
      assert.equal(await canvas.count(), 1)
      assert.equal(await page.locator('.modal').count(), 0)
      assert.ok(await workspace.evaluate((e) => e.scrollWidth <= e.clientWidth + 1), 'workspace horizontal overflow')
      assert.ok(await page.getByLabel('Company operations', { exact: true }).evaluate((e) => e.scrollWidth <= e.clientWidth + 1), 'operations content is clipped')
    }
    if (kind === 'cafe-contract' || kind === 'garage-build') {
      const project = page.locator('.workspace-operations > .project')
      const action = project.getByRole('button').first()
      await action.scrollIntoViewIfNeeded()
      const rect = await action.boundingBox()
      assert.ok(rect.y >= 0 && rect.y + rect.height <= height + 1, 'pre-hit project action is clipped')
      assert.ok(await project.evaluate((e) => e.scrollWidth <= e.clientWidth + 1), 'pre-hit project overflow')
      await project.locator('.bar').last().scrollIntoViewIfNeeded()
    }
    const dismiss = page.getByRole('button', { name: 'Dismiss', exact: true })
    if (await dismiss.isVisible()) await dismiss.click()
    // ResizeObserver can resize/clear WebGL between DOM updates and the next Pixi render.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))))
    await page.screenshot({ path: `${shots}/${kind}-${width}${height !== 900 ? `-h${height}` : ''}${largeFont ? '-large-font' : ''}.png` })
    await page.getByRole('button', { name: /^Team \d/ }).focus()
    await page.keyboard.press('Space')
    const modal = page.getByRole('dialog')
    await modal.waitFor()
    if (largeFont) await stressFont(page)
    const close = modal.getByRole('button', { name: 'Close', exact: true })
    await close.scrollIntoViewIfNeeded()
    const rect = await close.boundingBox()
    assert.ok(rect.x >= 0 && rect.x + rect.width <= width + 1, 'Close is sideways/off-screen')
    assert.ok(await modal.evaluate((e) => e.scrollWidth <= e.clientWidth + 1), 'management dialog overflow')
    assert.equal(await modal.getByRole('button', { name: 'Show', exact: true }).count(), 0)
    await close.click()
    assert.equal(await page.getByRole('button', { name: 'Pause', exact: true }).getAttribute('aria-pressed'), 'true')
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'page overflow')
    assert.deepEqual(errors, [])
    await page.close()
    console.log(`workspace ${kind} passed at ${width}x${height}${largeFont ? ' / large font' : ''}`)
  }
} finally { await browser.close() }
