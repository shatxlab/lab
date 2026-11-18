// Real same-origin Web Locks/localStorage, isolated synthetic browser profile. No live v12 rollout.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const code = readFileSync('/tmp/stage6-persistence-harness.js', 'utf8')
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ bypassCSP: true }) // Inject only the test harness, not a production script path.
try {
  const pages = await Promise.all([context.newPage(), context.newPage(), context.newPage()])
  for (const page of pages) {
    await page.goto(process.env.BASE_URL ?? 'http://127.0.0.1:4322/') // No Tycoon island/legacy autosave on this page.
    await page.addScriptTag({ content: code })
  }
  const [a, b, holder] = pages
  const results = await Promise.all([a, b].map((page, index) => page.evaluate(async (index) => {
    const H = window.CareerHarness
    window.owner = H.createCareerPersistence(localStorage, H.browserCareerLock(), null)
    return window.owner.reset(H.createInitialState(index + 1), { careerId: `synthetic-${index}`, companyId: 'first' })
  }, index)))
  assert.equal(results.filter((r) => r.ok).length, 1)
  console.log('Real Web Locks: simultaneous absent-key initializers publish exactly one career')
  const winner = results[0].ok ? a : b, other = results[0].ok ? b : a
  await other.evaluate(() => {
    const H = window.CareerHarness, raw = localStorage.getItem('lab:tycoon:save')
    window.oldDraft = JSON.parse(raw)
    window.owner = H.createCareerPersistence(localStorage, H.browserCareerLock(), raw)
  })
  assert.equal((await winner.evaluate(() => window.owner.advanceActive(1))).ok, true)
  assert.equal((await other.evaluate(() => window.owner.save(window.oldDraft))).ok, false)
  assert.equal(await other.evaluate(() => window.owner.status), 'conflict')
  console.log('Real Web Locks: stale second-tab save suspends without overwriting the newer company day')

  const hold = async () => holder.evaluate(() => new Promise((ready) => {
    void navigator.locks.request(window.CareerHarness.CAREER_SAVE_LOCK, () => new Promise((release) => { window.release = release; ready(true) }))
  }))
  await hold()
  await winner.evaluate(() => {
    const snapshot = JSON.parse(localStorage.getItem('lab:tycoon:save'))
    snapshot.game.day++
    window.pending = window.owner.save(snapshot)
  })
  await holder.waitForFunction(async () => (await navigator.locks.query()).pending.some((lock) => lock.name === window.CareerHarness.CAREER_SAVE_LOCK))
  await winner.evaluate(() => { window.replacement = window.owner.reset(window.CareerHarness.createInitialState(9), { careerId: 'synthetic-reset', companyId: 'reset-first' }) })
  await holder.evaluate(() => window.release())
  const barrier = await winner.evaluate(async () => ({ old: await window.pending, next: await window.replacement, raw: JSON.parse(localStorage.getItem('lab:tycoon:save')) }))
  assert.equal(barrier.old.ok, false)
  assert.equal(barrier.next.ok, true)
  assert.equal(barrier.raw.finance.careerId, 'synthetic-reset')
  assert.equal(barrier.raw.game.day, 0)
  console.log('Real Web Locks: reset barrier cancels a lock-waiting autosave, without an empty-key gap')

  await hold()
  const beforeStop = await winner.evaluate(() => {
    const raw = localStorage.getItem('lab:tycoon:save')
    const snapshot = JSON.parse(raw); snapshot.game.day++
    window.pending = window.owner.save(snapshot)
    return raw
  })
  await holder.waitForFunction(async () => (await navigator.locks.query()).pending.some((lock) => lock.name === window.CareerHarness.CAREER_SAVE_LOCK))
  await winner.evaluate(() => window.owner.stop())
  await holder.evaluate(() => window.release())
  assert.equal((await winner.evaluate(() => window.pending)).ok, false)
  assert.equal(await winner.evaluate(() => localStorage.getItem('lab:tycoon:save')), beforeStop)
  console.log('Real Web Locks: stop/disposal cancels a lock-waiting write')

  const quota = await winner.evaluate(async () => {
    const H = window.CareerHarness, before = localStorage.getItem('lab:tycoon:save')
    let blocked = true
    const storage = { getItem: (k) => localStorage.getItem(k), removeItem: (k) => localStorage.removeItem(k), setItem: (k, v) => {
      if (blocked) throw new DOMException('Synthetic quota', 'QuotaExceededError')
      localStorage.setItem(k, v)
    } }
    const owner = H.createCareerPersistence(storage, H.browserCareerLock(), before)
    const draft = JSON.parse(before); draft.game.day++
    const failed = await owner.save(draft), intact = localStorage.getItem('lab:tycoon:save') === before && owner.token === before
    blocked = false
    const retried = await owner.save(draft)
    return { failed, intact, retried }
  })
  assert.equal(quota.failed.ok, false)
  assert.equal(quota.intact, true)
  assert.equal(quota.retried.ok, true)
  console.log('Real Web Locks: quota failure preserves the source token and explicit retry succeeds')

  const unsupported = await winner.evaluate(async () => {
    const owner = window.CareerHarness.createCareerPersistence(localStorage, null, localStorage.getItem('lab:tycoon:save'))
    return { result: await owner.import(localStorage.getItem('lab:tycoon:save')), status: owner.status }
  })
  assert.equal(unsupported.result.ok, false)
  assert.equal(unsupported.status, 'unsupported')
  console.log('No Web Locks: unsupported owner rejects import, without unlocked fallback')
} finally { await context.close(); await browser.close() }
