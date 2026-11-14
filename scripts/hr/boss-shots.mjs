// Screenshots every floor's boss phase, from the runs `craft-boss-runs.ts` crafted: load each saved run, resume it,
// wait for the boss to be on screen, and shoot. Run the preview server first, then:
//   node scripts/hr/boss-shots.mjs /tmp/hr-boss-runs.json /tmp/hr-boss-shots
import { mkdirSync } from 'node:fs'
import process from 'node:process'
import { createRequire } from 'node:module'
const require2 = createRequire(process.env.PUPPETEER_DIR ? `${process.env.PUPPETEER_DIR}/index.js` : import.meta.url)
const puppeteer = require2('puppeteer-core')

const runsPath = process.argv[2] ?? '/tmp/hr-boss-runs.json'
const outDir = process.argv[3] ?? '/tmp/hr-boss-shots'
const url = process.argv[4] ?? 'http://127.0.0.1:4321/hr/'
const runs = (await import(runsPath, { with: { type: 'json' } })).default
mkdirSync(outDir, { recursive: true })

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/microsoft-edge', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const page = await browser.newPage()
await page.setViewport({ width: 360, height: 780 })
await page.goto(url, { waitUntil: 'networkidle0' })
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('lab:lang', 'en'); localStorage.setItem('lab:hr:v1', JSON.stringify({ focusId: 2, owned: [2], sealed: [], stage: 'openSpace', gold: 0 })) })
for (const [floor, runJson] of Object.entries(runs)) {
  await page.evaluate((json) => localStorage.setItem('lab:hr:run:v1', json), runJson)
  await page.reload({ waitUntil: 'networkidle0' })
  const contEl = await page.evaluateHandle(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Continue the run')).then((h) => h.asElement())
  if (!contEl) { console.log(`floor ${floor}: no continue button`); continue }
  await contEl.click()
  // Wait for the boss to be inside the view (or give up after a while and shoot anyway).
  let onScreen = false
  for (let wait = 0; wait < 40 && !onScreen; wait += 1) {
    onScreen = await page.evaluate(() => {
      const run = JSON.parse(localStorage.getItem('lab:hr:run:v1') ?? '{}')
      const boss = run.foes?.find((foe) => foe.id === run.bossId)
      return Boolean(boss)
    })
    if (!onScreen) await new Promise((resolve) => setTimeout(resolve, 500))
  }
  // Let the walk-in settle and the intro card show, then pause the run and hide the pause panel, so the shot
  // catches the phase itself — the parked hero would otherwise be eaten by the swarm on the busy floors.
  await new Promise((resolve) => setTimeout(resolve, 900))
  await page.keyboard.press('Escape')
  await new Promise((resolve) => setTimeout(resolve, 300))
  await page.evaluate(() => { for (const overlay of document.querySelectorAll('.tower-overlay')) overlay.style.display = 'none' })
  await new Promise((resolve) => setTimeout(resolve, 200))
  await page.screenshot({ path: `${outDir}/boss-${String(floor).padStart(2, '0')}.png` })
  // Walk out before the next injection: a live run autosaves over it on the way out (see floors-check.mjs).
  await page.evaluate(() => { for (const overlay of document.querySelectorAll('.tower-overlay')) overlay.style.display = '' })
  const outEl = await page.evaluateHandle(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Walk out')).then((h) => h.asElement())
  if (!outEl) { console.log(`floor ${floor}: no walk-out button`); continue }
  await outEl.click()
  await new Promise((resolve) => setTimeout(resolve, 600))
  console.log(`floor ${floor}: shot${onScreen ? '' : ' (boss not confirmed on screen)'}`)
}
await browser.close()
