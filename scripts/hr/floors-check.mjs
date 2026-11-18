// Browser check for the HR floor-plan refactor: drives a real Chrome/Edge at phone width, EN and RU, on a dev or
// preview server.
//   npx esbuild scripts/hr/craft-run.ts --bundle --platform=node --format=esm --alias:@=./src --outfile=/tmp/hr-sim.mjs
//   node scripts/hr/floors-check.mjs http://127.0.0.1:4321/hr /tmp/hr-sim.mjs
// What it does, per language: starts a fresh day and checks the floor HUD and the field; walks out (so no live run
// autosaves over what is injected); resumes a run crafted by the real sim to sit exactly on a cleared floor, and
// checks the cleared overlay (title, picks, Descend), takes the stairs and checks floor 2's HUD.
// Needs puppeteer-core: set PUPPETEER_DIR to a directory with it installed, or have it resolvable from here.
import process from 'node:process'
import { createRequire } from 'node:module'
const require2 = createRequire(process.env.PUPPETEER_DIR ? `${process.env.PUPPETEER_DIR}/index.js` : import.meta.url)
const puppeteer = require2('puppeteer-core')

const url = process.argv[2] ?? 'http://127.0.0.1:4321/lab/hr'
const sim = await import(process.argv[3] ?? '/tmp/hr-sim.mjs')
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/microsoft-edge', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const page = await browser.newPage()
await page.setViewport({ width: 360, height: 780 })

const fail = []
const check = (ok, label) => { console.log(`${ok ? 'ok' : 'FAIL'} ${label}`); if (!ok) fail.push(label) }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

for (const lang of ['en', 'ru']) {
  await page.goto(url, { waitUntil: 'networkidle0' })
  await page.evaluate((lang) => { localStorage.clear(); localStorage.setItem('lab:lang', lang) }, lang)
  await page.reload({ waitUntil: 'networkidle0' })
  await page.evaluate(() => { localStorage.removeItem('lab:hr:run:v1'); localStorage.setItem('lab:hr:v1', JSON.stringify({ focusId: 2, owned: [2], sealed: [], stage: 'openSpace', gold: 0 })) })
  await page.reload({ waitUntil: 'networkidle0' })
  // The roster the page deals on first visit drives the crafted run.
  const rosterJson = await page.evaluate(() => localStorage.getItem('lab:roster:v1'))
  const roster = JSON.parse(rosterJson)
  const coworker = roster.coworkers[0]
  const runJson = sim.craftClearedRun(coworker)
  const emptyJson = sim.craftClearedNoPicksRun(coworker)

  // 1. Fresh start.
  await page.evaluate(() => localStorage.removeItem('lab:hr:run:v1'))
  await page.reload({ waitUntil: 'networkidle0' })
  const goLabel = lang === 'en' ? 'Go to work' : 'На работу'
  const goEl = await page.evaluateHandle((label) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label), goLabel).then((h) => h.asElement())
  if (!goEl) { check(false, `${lang}: found the start button`); continue }
  await goEl.click()
  await sleep(1200)
  const hud = await page.evaluate(() => document.querySelector('.hr-hud-clock')?.textContent ?? '')
  const floorText = lang === 'en' ? 'Floor 1' : 'Этаж 1'
  const bossText = lang === 'en' ? 'Middle Manager in 0:' : 'Менеджер среднего звена через 0:'
  check(hud.includes(floorText) || hud.includes(bossText), `${lang}: HUD shows the floor / boss countdown (${hud.trim()})`)
  check(Boolean(await page.$('canvas.tower-canvas')), `${lang}: the field renders`)
  await page.screenshot({ path: `/tmp/hr-floors-${lang}-run.png` })

  // Walk out, so no live run autosaves over the injected save on the next reload.
  await page.keyboard.press('Escape')
  await sleep(400)
  const outLabel = lang === 'en' ? 'Walk out' : 'Уйти'
  const outEl = await page.evaluateHandle((label) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label), outLabel).then((h) => h.asElement())
  if (!outEl) { check(false, `${lang}: found the walk-out button`); continue }
  await outEl.click()
  await sleep(600)

  // 2. A run saved exactly on a cleared floor resumes into the cleared overlay.
  await page.evaluate((json) => localStorage.setItem('lab:hr:run:v1', json), runJson)
  await page.reload({ waitUntil: 'networkidle0' })
  const continueLabel = lang === 'en' ? 'Continue the run' : 'Продолжить забег'
  const contEl = await page.evaluateHandle((label) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label), continueLabel).then((h) => h.asElement())
  check(Boolean(contEl), `${lang}: the suspended run is offered`)
  if (!contEl) continue
  await contEl.click()
  await sleep(1200)
  const clearedTitle = lang === 'en' ? 'Floor cleared' : 'Этаж зачищен'
  const body = await page.evaluate(() => document.body.textContent)
  if (!body.includes(clearedTitle)) console.log(`  [debug ${lang}] body tail:`, body.replace(/\s+/g, ' ').slice(-400), '| run keys:', await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('lab:hr:run:v1') ?? '{}')).join(',')))
  check(body.includes(clearedTitle), `${lang}: the cleared overlay shows on resume`)
  check(body.includes(lang === 'en' ? 'Level up' : 'Новый уровень') || Boolean(await page.$('.tower-choice')), `${lang}: the pick offer is there`)
  await page.screenshot({ path: `/tmp/hr-floors-${lang}-cleared.png` })
  const descendLabel = lang === 'en' ? 'Descend' : 'Спуститься'
  const descendEl = await page.evaluateHandle((label) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label), descendLabel).then((h) => h.asElement())
  check(Boolean(descendEl), `${lang}: the stairs button is there`)
  if (descendEl) {
    await descendEl.click()
    await sleep(1200)
    const hud2 = await page.evaluate(() => document.querySelector('.hr-hud-clock')?.textContent ?? '')
    // During a floor's horde the HUD counts down to its own boss; floor 2's is the meeting invite.
    const floor2 = lang === 'en' ? ['Floor 2', 'Meeting Chair in'] : ['Этаж 2', 'Кресло совещаний через']
    check(floor2.some((needle) => hud2.includes(needle)), `${lang}: after the stairs the HUD shows floor 2 (${hud2.trim()})`)
    await page.screenshot({ path: `/tmp/hr-floors-${lang}-floor2.png` })

    // 3. A cleared floor with every pick taken keeps the stairs reachable (the field froze here once). Descending
    // may owe level-up offers; take them all before pausing, or Escape will not pause.
    for (let offer = 0; offer < 20; offer += 1) {
      const choiceEl = await page.evaluateHandle(() => document.querySelector('.tower-choice')).then((h) => h.asElement())
      if (!choiceEl) break
      await choiceEl.click()
      await sleep(300)
    }
    await page.keyboard.press('Escape')
    await sleep(400)
    const walk2El = await page.evaluateHandle((label) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label), outLabel).then((h) => h.asElement())
    if (!walk2El) { check(false, `${lang}: found the walk-out button for the empty-panel phase`); continue }
    await walk2El.click()
    await sleep(600)
    await page.evaluate((json) => localStorage.setItem('lab:hr:run:v1', json), emptyJson)
    await page.reload({ waitUntil: 'networkidle0' })
    const cont2El = await page.evaluateHandle((label) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label), continueLabel).then((h) => h.asElement())
    if (!cont2El) { check(false, `${lang}: the empty-pick run is offered`); continue }
    await cont2El.click()
    await sleep(1200)
    const body3 = await page.evaluate(() => document.body.textContent)
    check(body3.includes(clearedTitle), `${lang}: the empty-pick cleared panel still shows`)
    const stairsEl = await page.evaluateHandle((label) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label), descendLabel).then((h) => h.asElement())
    check(Boolean(stairsEl), `${lang}: the stairs stay reachable with no picks left`)
    if (stairsEl) {
      await stairsEl.click()
      await sleep(1200)
      const hud3 = await page.evaluate(() => document.querySelector('.hr-hud-clock')?.textContent ?? '')
      check(floor2.some((needle) => hud3.includes(needle)), `${lang}: the empty-pick descent reaches floor 2 (${hud3.trim()})`)
    }
  }
}

await browser.close()
console.log(fail.length === 0 ? 'ALL OK' : `FAILURES: ${fail.length}`)
process.exitCode = fail.length === 0 ? 0 : 1
