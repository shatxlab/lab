// Browser smoke test for the tycoon island: `npm run build && node scripts/tycoon/e2e.mjs` (serves dist/ with `astro preview`, drives real Chrome).
// The standalone app's PWA scenario is not ported: the lab's service worker / install flow is covered by the lab's own PWA tests.
//   node scripts/tycoon/e2e.mjs --url https://shatx.ru/tycoon/   test a deployed site (no play-through)
//   node scripts/tycoon/e2e.mjs --quick                                          skip the ~30 s play-through
//   node scripts/tycoon/e2e.mjs --only play                                      run just one scenario (load, event, research, lifecycle, launch, staff, stats, sound, looks, play)
// Needs Chrome: set CHROME_PATH, or it tries the usual install locations.
// Set E2E_SHOTS=/some/dir to also save screenshots of the key screens.
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { PNG } from 'pngjs'
import puppeteer from 'puppeteer-core'
import { appearanceFor, HAIR_RAMPS, SHIRT_RAMPS } from '../../src/lib/tycoon/render/characters.ts'
import { sceneLayout } from '../../src/lib/tycoon/render/layout.ts'
import { generateEmployee, ROLES } from '../../src/lib/tycoon/sim/hiring.ts'
import { SAVE_KEY } from '../../src/lib/tycoon/save.ts'
import { startProject } from '../../src/lib/tycoon/sim/project.ts'
import { createInitialState, serialize, STATE_VERSION } from '../../src/lib/tycoon/sim/state.ts'
import { START_MONEY } from '../../src/lib/tycoon/sim/balance.ts'
import { formatMoney } from '../../src/lib/tycoon/format.ts'
import { advance } from '../../src/lib/tycoon/sim/tick.ts'

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const option = (name) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined)

const PORT = 4179
const remoteUrl = option('url')
const BASE_URL = remoteUrl ?? `http://localhost:${PORT}/lab/tycoon/`
const PLAY = !remoteUrl && !flag('quick')
const ONLY = option('only') // run a single scenario, e.g. --only play

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const SHOTS = process.env.E2E_SHOTS

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]
  const found = candidates.find((path) => path && existsSync(path))
  if (!found) throw new Error('Chrome not found. Set CHROME_PATH.')
  return found
}

let failures = 0
function check(name, ok, detail = '') {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

async function startPreview() {
  const server = spawn('npx', ['astro', 'preview', '--port', String(PORT)], { stdio: 'ignore' })
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE_URL)).ok) return server
    } catch {
      // not up yet
    }
    await sleep(250)
  }
  server.kill()
  throw new Error('astro preview did not start')
}

/**
 * An isolated profile so saves never leak between scenarios.
 */
async function openGame(browser, { width = 1100, height = 800, incognito = true, save = null, spyAudio = false } = {}) {
  const context = incognito ? await browser.createBrowserContext() : browser.defaultBrowserContext()
  const page = await context.newPage()
  await page.setViewport({ width, height, deviceScaleFactor: 1 })

  const problems = []
  page.on('pageerror', (error) => problems.push(`pageerror: ${String(error).slice(0, 200)}`))
  page.on('console', (message) => message.type() === 'error' && problems.push(`console: ${message.text().slice(0, 200)}`))
  page.on('response', (response) => response.status() >= 400 && problems.push(`${response.status()} ${response.url()}`))

  const text = () => page.evaluate(() => document.body.innerText)
  const waitFor = async (needle, ms = 30000) => {
    const start = Date.now()
    // Compared without case: much of the UI is styled uppercase, and innerText reports it that way.
    while (!(await text()).toLowerCase().includes(needle.toLowerCase())) {
      if (Date.now() - start > ms) throw new Error(`timed out waiting for "${needle}"`)
      await sleep(150)
    }
  }
  /** Clicks the first enabled button whose text starts with `label`, optionally only inside `scope`. */
  const click = async (label, scope = 'body') => {
    const ok = await page.evaluate((wanted, within) => {
      const button = [...document.querySelectorAll(`${within} button`)].find((b) => !b.disabled && b.textContent.trim().startsWith(wanted))
      button?.click()
      return Boolean(button)
    }, label, scope)
    if (!ok) throw new Error(`no enabled button starting with "${label}" in ${scope}`)
  }
  const stats = () =>
    page.evaluate(() => ({
      money: document.querySelector('.topbar .stat .value')?.textContent,
      date: document.querySelectorAll('.topbar .stat .value')[1]?.textContent,
      project: document.querySelector('.project strong')?.textContent ?? null,
      speed: document.querySelector('.speed .active')?.textContent,
      dialog: Boolean(document.querySelector('.modal')),
    }))

  // A crafted save, installed only if the browser has none, so reloads keep what the game wrote.
  if (save) {
    await page.evaluateOnNewDocument((key, value) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value)
    }, SAVE_KEY, save)
  }
  if (spyAudio) {
    // Count the oscillators the game creates, so "it made a sound" can be checked without ears.
    await page.evaluateOnNewDocument(() => {
      window.__oscillators = 0
      const Real = window.AudioContext
      window.AudioContext = class extends Real {
        createOscillator() {
          window.__oscillators += 1
          return super.createOscillator()
        }
      }
    })
  }
  const shot = (name) => (SHOTS ? page.screenshot({ path: join(SHOTS, `${name}.png`) }) : null)

  await page.goto(BASE_URL, { waitUntil: 'load' })
  await page.waitForSelector('.topbar')
  return { page, context, problems, text, waitFor, click, stats, shot, close: () => (incognito ? context.close() : page.close()) }
}

async function scenarioLoad(browser) {
  const { page, close, problems, waitFor, text, shot } = await openGame(browser)
  await waitFor('New project')
  await sleep(500)
  await shot('1-new-project')
  check('game renders a canvas', await page.evaluate(() => Boolean(document.querySelector('#scene-host canvas'))))
  check('first launch opens the new-project dialog', (await text()).includes('Start project'))
  check('product types show their market demand', (await text()).includes('≈ normal'))
  check('speed controls are Pause / 1× / 2× (no 4×)', await page.evaluate(() =>
    [...document.querySelectorAll('.speed button')].map((b) => b.textContent.trim()).join(',') === 'Pause,1×,2×'))
  check('no console errors or failed requests', problems.length === 0, problems.join(' | '))
  await close()
}

async function scenarioEvent(browser) {
  // A studio that quit mid-event: the dialog must be waiting, and answering it must stick.
  const state = createInitialState(7)
  state.day = 60
  state.lastEventDay = 55
  state.money = 25000
  state.reputation = 12
  state.pendingEvent = { id: 'press', data: {} }
  const { page, close, problems, waitFor, click, text, shot, stats } = await openGame(browser, { save: serialize(state) })

  await waitFor('In the press')
  await sleep(400)
  await shot('2-event')
  check('a saved pending event reopens its dialog on load', (await text()).includes('glowing piece'))
  check('the event cannot be dismissed without choosing', await page.evaluate(() => !document.querySelector('.modal button:not(.event-choice)')))
  await click('Nice!')
  await waitFor('inbox is full')
  await sleep(300)
  await shot('3-toast')
  const after = await stats()
  check('choosing closes the dialog and shows the outcome as a toast', !after.dialog && (await text()).includes('inbox is full'))

  await sleep(2600) // let the autosave land, then reload
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('.topbar')
  await sleep(1000)
  check('the answered event does not come back after a reload', !(await stats()).dialog)
  check('event scenario had no console errors', problems.length === 0, problems.join(' | '))
  await close()
}

async function scenarioResearch(browser) {
  // Research that finishes on the next game day, with money to start another.
  const state = createInitialState(3)
  state.day = 80
  state.lastEventDay = 80
  state.money = 100000
  state.reputation = 15
  state.research = { done: ['ci_pipeline'], active: { id: 'code_review', finishDay: 81 } }
  const { page, close, problems, waitFor, click, text, shot, stats } = await openGame(browser, { save: serialize(state) })

  await click('2×')
  await waitFor('Research complete: Code review culture', 20000)
  check('finished research is announced with a toast', true)
  await click('Pause')

  await click('Research')
  await waitFor('Nothing is being researched')
  await sleep(300)
  await shot('4-research')
  const dialog = await text()
  check('the research dialog lists finished work', (dialog.match(/✓ Done/g) ?? []).length === 2)

  const before = (await stats()).money
  await click('Research', '.modal') // first available node
  await sleep(300)
  const after = await stats()
  check('starting research charges money and shows progress', after.money !== before && (await text()).includes('Researching:'))
  await click('Close')
  check('the top bar shows days left', await page.evaluate(() => /Research\s*·\s*\d+d/.test(document.querySelector('.topbar-actions').textContent)))

  await click('Start a project')
  await waitFor('New project')
  await sleep(300)
  await shot('5-locked-features')
  check('product types from later eras are shown as locked', await page.evaluate(() =>
    [...document.querySelectorAll('.chip:disabled')].some((c) => c.textContent.includes('AI Product') && c.textContent.includes('Not until'))))
  check('features behind research are shown as locked and cannot be ticked', await page.evaluate(() => {
    const row = [...document.querySelectorAll('.feature.locked')].find((r) => r.textContent.includes('Voice interface'))
    return Boolean(row) && row.textContent.includes('Research: Machine learning') && row.querySelector('input').disabled
  }))
  await click('Cancel')

  await sleep(2600)
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('.topbar')
  await sleep(1000)
  check('active research survives a reload', await page.evaluate(() => /Research\s*·\s*\d+d/.test(document.querySelector('.topbar-actions').textContent)))
  check('research scenario had no console errors', problems.length === 0, problems.join(' | '))
  await close()
}

/** A studio with one earning (and somewhat buggy) product, no project running, and no random event due for a while. */
function studioWithProduct() {
  const state = createInitialState(5)
  state.day = 90
  state.lastEventDay = 160 // the cooldown counts from here, so nothing interrupts the next two months
  state.money = 50000
  state.reputation = 20
  state.products.push({
    id: 50,
    name: 'Atlas',
    productTypeId: 'web_app',
    size: 'small',
    featureIds: ['accounts'],
    quality: 82,
    releaseDay: 60,
    reach: 15000,
    users: 14000,
    bugs: 12,
    hit: false,
    totalRevenue: 3000,
    updates: [],
    boostUntil: 0,
    boostUsers: 0,
  })
  return state
}

const moneyOf = (text) => Number(text.replace(/[^0-9.-]/g, ''))

async function scenarioLifecycle(browser) {
  const { page, close, problems, waitFor, click, text, shot, stats } = await openGame(browser, { save: serialize(studioWithProduct()) })

  await click('Studio')
  await waitFor('Atlas')
  await sleep(300)
  await shot('6-products')
  check('a live product offers Update, Fix bugs and Promote', await page.evaluate(() => {
    const row = document.querySelector('.product')
    const open = (label) => [...row.querySelectorAll('button')].some((b) => b.textContent.startsWith(label) && !b.disabled)
    return Boolean(row) && open('Update') && open('Fix bugs') && open('Promote')
  }))
  check('a live product shows its users and bugs', /14,000 users/.test(await text()) && (await text()).includes('12 bugs'))

  const before = moneyOf((await stats()).money)
  await click('Promote', '.modal')
  await click('Small', '.modal')
  await sleep(300)
  check('promoting charges money and the product shows it', moneyOf((await stats()).money) < before && (await text()).includes('promoted, 20d left'))

  await click('Update', '.modal')
  await waitFor('Update Atlas')
  await sleep(300)
  await shot('7-update')
  check('the update planner is smaller and says what it adds', (await text()).includes('Reach if finished on target'))
  await page.evaluate(() => [...document.querySelectorAll('label')].find((l) => l.textContent.includes('Dark mode'))?.click())
  await click('Start update')
  await sleep(300)
  check('an update shows up as an update in the project panel', await page.evaluate(() => document.querySelector('.project')?.textContent.includes('update')))

  await click('2×')
  await waitFor('Ready to ship', 40000)
  await click('Release it')
  await waitFor('Release update for Atlas')
  await sleep(300)
  await shot('8-release')
  check('releasing an update offers no launch campaign', !(await text()).includes('No campaign'))
  await click('Release update', '.modal')
  await waitFor('Updated')
  await sleep(300)
  check('the result says it was an update and what it adds', (await text()).toLowerCase().includes('interested again'))
  check('lifecycle scenario had no console errors', problems.length === 0, problems.join(' | '))
  await close()
}

async function scenarioLaunch(browser) {
  // A finished new product, about to ship: try a launch campaign.
  const state = studioWithProduct()
  startProject(state, 'web_app', ['accounts'])
  const project = state.offices[0].project
  for (const d of ['design', 'engineering', 'qa']) project.progress[d] = project.target[d]
  project.readyNotified = true
  const { page, close, problems, waitFor, click, text, shot, stats } = await openGame(browser, { save: serialize(state) })

  await click('Ship')
  await waitFor('Launch Atlas'.replace('Atlas', ''))
  await sleep(300)
  await shot('9-launch')
  const before = moneyOf((await stats()).money)
  const priced = await page.evaluate(() => {
    const label = [...document.querySelectorAll('.campaign')].find((l) => l.textContent.includes('Small campaign'))
    label.click()
    return label.textContent
  })
  const cost = moneyOf(priced.match(/-\$[\d,]+/)[0].replace('-', ''))
  check('launch campaigns are priced up front', cost > 0)
  await click('Launch', '.modal')
  await waitFor('Released')
  const after = moneyOf((await stats()).money)
  check('the campaign costs exactly the displayed price', before - after === cost, `${before} - ${after} vs ${cost}`)
  check('launch scenario had no console errors', problems.length === 0, problems.join(' | '))
  await close()
}

async function scenarioFix(browser) {
  const { page, close, problems, waitFor, click, text, shot } = await openGame(browser, { save: serialize(studioWithProduct()) })

  await waitFor('Fix 12 bugs in Atlas')
  await shot('9b-idle-fix')
  await click('🐞 Fix 12 bugs')
  await sleep(300)
  check('a bug-fixing sprint shows in the project panel', await page.evaluate(() => document.querySelector('.project.fixing')?.textContent.includes('Fixing Atlas')))
  await click('2×')
  await sleep(2500)
  await shot('9c-fixing')
  await waitFor('bugs fixed.', 60000)
  await sleep(300)
  check('the sprint ends on its own and the panel goes idle', await page.evaluate(() => Boolean(document.querySelector('.project.idle'))))
  await click('Pause')
  await click('Studio')
  await waitFor('Atlas')
  const bugs = Number((await text()).match(/🐞 (\d+) bug/)?.[1] ?? NaN)
  check('the product has its bugs fixed', bugs < 3, `${bugs} bugs left`)
  check('fix scenario had no console errors', problems.length === 0, problems.join(' | '))
  await close()
}

/** A studio further along: out of the garage, two offices each with a team, at the established stage. */
function establishedStudio() {
  const state = studioWithProduct()
  state.stage = 3
  state.money = 2_000_000
  state.offices[0].kind = 'office'
  state.offices.push({ id: state.nextId++, kind: 'office', theme: 1, project: null })
  for (const office of state.offices) {
    while (state.employees.filter((e) => e.officeId === office.id).length < 6) {
      state.employees.push({ ...generateEmployee(state, ROLES[state.employees.length % ROLES.length]), officeId: office.id })
    }
  }
  startProject(state, 'web_app', ['accounts'], 'small', state.offices[0].id)
  return state
}

async function scenarioJourney(browser) {
  // A brand-new game starts in the garage, with client work on offer and the journey ahead.
  const fresh = await openGame(browser)
  await fresh.waitFor('New project')
  await fresh.click('Client work')
  await sleep(300)
  await fresh.shot('19-client-work')
  check('client work is on offer from the start', await fresh.page.evaluate(() => document.querySelectorAll('.contract-offer').length > 0))
  const pay = await fresh.page.evaluate(() => document.querySelector('.contract-offer button')?.textContent ?? '')
  await fresh.click('Take it', '.modal')
  await sleep(300)
  check('taking a job shows it in the project panel', await fresh.page.evaluate(() => Boolean(document.querySelector('.project.contract'))), pay)
  await sleep(1200)
  await fresh.shot('20-garage')
  await fresh.click('Studio')
  await fresh.click('Journey', '.modal')
  await fresh.waitFor('You are here')
  await sleep(300)
  await fresh.shot('21-journey')
  check('the journey starts in the garage with goals to reach', (await fresh.text()).includes('Garage startup') && (await fresh.text()).includes('Deliver a job for a client'))
  await fresh.click('Industry', '.modal')
  await fresh.waitFor('Markets')
  await sleep(300)
  await fresh.shot('22-industry')
  check('the industry ranking lists the rivals and your studio', await fresh.page.evaluate(() => document.querySelectorAll('.industry tbody tr').length >= 6 && document.querySelector('.industry tr.you') !== null))
  check('journey scenario had no console errors', fresh.problems.length === 0, fresh.problems.join(' | '))
  await fresh.close()

  // Two offices: tabs switch the scene and the panel between them.
  const { page, close, problems, waitFor, click, text, shot } = await openGame(browser, { save: serialize(establishedStudio()) })
  await waitFor('Office 2')
  await sleep(800)
  await shot('23-hq')
  check('the HQ panel shows its project', (await text()).includes('Small Web App'))
  await page.evaluate(() => [...document.querySelectorAll('.office-tabs button')].find((b) => b.textContent.includes('Office 2'))?.click())
  await sleep(800)
  await shot('24-second-office')
  check('switching office shows its own (idle) panel', await page.evaluate(() => Boolean(document.querySelector('.project.idle'))))
  await click('Team')
  await waitFor('Team & offices')
  await sleep(300)
  await shot('25-team-offices')
  check('the team dialog lists both offices and lets people move', await page.evaluate(() => document.querySelectorAll('.office-row').length === 2 && document.querySelectorAll('.person select').length > 0))
  check('offices scenario had no console errors', problems.length === 0, problems.join(' | '))
  await close()
}

async function scenarioStaff(browser) {
  const { page, close, problems, waitFor, click, text, shot, stats } = await openGame(browser, { save: serialize(studioWithProduct()) })

  await click('Team')
  await waitFor('Team outing')
  await sleep(300)
  await shot('10-team')
  check('team members show their trait and morale', await page.evaluate(() => document.querySelectorAll('.person .trait').length >= 2 && document.querySelectorAll('.person .morale').length === 2))

  await click('Details', '.modal')
  await waitFor('Mood')
  await sleep(300)
  await shot('11-employee')
  check('a person has a details page with skills and mood', (await text()).includes('Skills') && (await text()).includes('Training takes'))
  const before = moneyOf((await stats()).money)
  await click('Train', '.modal')
  await sleep(300)
  check('training charges money and takes them off work', moneyOf((await stats()).money) < before && /Training \w+: 10 days left/.test(await text()))

  await click('Back to team', '.modal')
  await waitFor('Team outing')
  const beforeOuting = moneyOf((await stats()).money)
  await click('Go', '.modal')
  await sleep(300)
  check('a team outing costs money and then has a cooldown', moneyOf((await stats()).money) < beforeOuting && (await text()).includes('Again in 30 days'))
  await click('Close')

  // Click the first character in the office itself.
  const host = await page.evaluate(() => {
    const r = document.querySelector('#scene-host').getBoundingClientRect()
    return { left: r.left, top: r.top, width: r.width, height: r.height }
  })
  const layout = sceneLayout(host.width, host.height, 170) // a garage (one row of desks) shows the room down to row 170
  const point = { x: host.left + (47.5 - layout.left) * layout.scale, y: host.top + (146 - layout.top) * layout.scale }
  await page.mouse.click(point.x, point.y)
  await waitFor('Mood', 5000)
  check('clicking a character in the office opens their details', (await text()).includes('Skills'))
  await shot('12-clicked')
  await click('Back to team', '.modal')
  await click('Close')

  await sleep(2600)
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('.topbar')
  await sleep(1000)
  await click('Team')
  await waitFor('Team outing')
  check('training and the outing cooldown survive a reload', (await text()).includes('Again in') && (await text()).toLowerCase().includes('training'))
  check('staff scenario had no console errors', problems.length === 0, problems.join(' | '))
  await close()
}

/** A studio with most of a year behind it, so there is history to chart. */
function studioWithHistory() {
  const state = studioWithProduct()
  state.shippedCount = 1
  advance(state, 270)
  state.pendingEvent = null // nothing waiting for an answer when the page opens
  state.events = []
  return state
}

async function scenarioStats(browser) {
  const { page, close, problems, waitFor, click, text, shot } = await openGame(browser, { save: serialize(studioWithHistory()) })

  await click('Studio')
  await click('Stats', '.tabs')
  await waitFor('Lifetime revenue')
  await sleep(500)
  await shot('13-stats')
  check('the stats tab shows two charts', (await page.evaluate(() => document.querySelectorAll('.viz svg .line').length)) === 3)
  check('only the two-series chart has a legend', (await page.evaluate(() => document.querySelectorAll('.viz .legend').length)) === 1)
  check('charts have axis labels and a labelled latest value', await page.evaluate(() => document.querySelectorAll('.viz .tick').length > 6 && document.querySelectorAll('.viz .end-label').length >= 2))
  check('no data line is a dashed or filled block', await page.evaluate(() => [...document.querySelectorAll('.viz .line')].every((l) => getComputedStyle(l).fill === 'none' && getComputedStyle(l).strokeDasharray === 'none')))

  // Hover: a crosshair and one tooltip listing the series.
  const box = await page.evaluate(() => {
    const r = document.querySelector('.viz-frame').getBoundingClientRect()
    return { x: r.left + r.width * 0.45, y: r.top + 60 }
  })
  await page.mouse.move(box.x, box.y)
  await sleep(200)
  await shot('14-hover')
  check('hovering shows a crosshair and a tooltip with the value', await page.evaluate(() => Boolean(document.querySelector('.viz .crosshair')) && /\$/.test(document.querySelector('.viz .tooltip')?.textContent ?? '')))
  await page.mouse.move(5, 5)
  await sleep(150)
  check('the tooltip goes away when the pointer leaves', await page.evaluate(() => !document.querySelector('.viz .tooltip')))

  // Keyboard: the second chart reads the same without a pointer.
  await page.focus('.viz:nth-of-type(2) .viz-frame, .viz + .viz .viz-frame')
  await page.keyboard.press('ArrowLeft')
  await sleep(150)
  const tooltip = await page.evaluate(() => document.querySelector('.viz + .viz .tooltip')?.textContent ?? '')
  check('arrow keys read a month, listing every series', tooltip.includes('Income') && tooltip.includes('Costs'), tooltip)

  // Table view is the twin of the charts.
  await click('Table', '.filters')
  await sleep(200)
  check('the table view has the same numbers', await page.evaluate(() => document.querySelectorAll('.history-table tbody tr').length >= 8 && !document.querySelector('.viz')))
  await click('Chart', '.filters')
  await click('1 year', '.filters')
  await sleep(200)
  check('a time range keeps both charts', await page.evaluate(() => document.querySelectorAll('.viz').length === 2))

  await click('Milestones', '.tabs')
  await waitFor('reached')
  await sleep(300)
  await shot('15-milestones')
  check('milestones list what is reached and what is next', /\d+ of \d+ reached/.test(await text()) && (await text()).includes('Reached'))
  check('stats scenario had no console errors', problems.length === 0, problems.join(' | '))
  await close()

  // On a phone the charts must fit the dialog.
  const phone = await openGame(browser, { width: 390, height: 780, save: serialize(studioWithHistory()) })
  await phone.click('Studio')
  await phone.click('Stats', '.tabs')
  await phone.waitFor('Lifetime revenue')
  await sleep(500)
  await phone.shot('16-stats-phone')
  check('on a phone the charts stay inside the dialog', await phone.page.evaluate(() => {
    const panel = document.querySelector('.tab-panel')
    const svgs = [...document.querySelectorAll('.viz svg')]
    return panel.scrollWidth <= panel.clientWidth + 1 && svgs.every((s) => s.getBoundingClientRect().right <= panel.getBoundingClientRect().right + 1)
  }))
  check('phone scenario had no console errors', phone.problems.length === 0, phone.problems.join(' | '))
  await phone.close()
}

async function scenarioSound(browser) {
  const state = studioWithProduct()
  state.stage = 1 // an indie studio, so it can move out of the garage
  const { page, close, problems, waitFor, click, text } = await openGame(browser, { save: serialize(state), spyAudio: true })
  const oscillators = () => page.evaluate(() => window.__oscillators)

  check('no sound is made before the player does anything', (await oscillators()) === 0)
  await page.mouse.click(10, 10) // a real pointer press: the first gesture is what lets the browser play sound
  await click('Team')
  await waitFor('Team outing')
  await click('Move', '.modal')
  await sleep(300)
  const afterUpgrade = await oscillators()
  check('a successful action plays a sound', afterUpgrade >= 4, `${afterUpgrade} oscillators`)

  await click('Close')
  await click('Menu')
  await waitFor('Sound: On')
  await click('Sound: On', '.modal')
  await sleep(200)
  check('the Menu can switch sound off, and says so', (await text()).includes('Sound: Off'))
  check('the choice is remembered in the browser', await page.evaluate(() => localStorage.getItem('lab:tycoon:muted') === '1'))
  const mutedAt = await oscillators()
  await click('Close')

  await click('Team')
  await waitFor('Team outing')
  await click('Hire', '.modal')
  await sleep(300)
  check('while muted, actions make no sound', (await oscillators()) === mutedAt, `${mutedAt} -> ${await oscillators()}`)

  await sleep(2600)
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('.topbar')
  await click('Menu')
  await waitFor('Sound: Off')
  check('muted stays muted after a reload', (await text()).includes('Sound: Off'))
  check('sound scenario had no console errors', problems.length === 0, problems.join(' | '))
  await close()
}

/** Every colour in the original sprite sheet, so a ramp colour that is also in the artwork can't prove a recolour. */
function sheetColours() {
  const sheet = PNG.sync.read(readFileSync('public/PixelOffice/PixelOfficeAssets.png'))
  const seen = new Set()
  for (let i = 0; i < sheet.data.length; i += 4) if (sheet.data[i + 3]) seen.add((sheet.data[i] << 16) | (sheet.data[i + 1] << 8) | sheet.data[i + 2])
  return seen
}

async function scenarioLooks(browser) {
  // A full office of twelve: their hair and shirts should come from the recolour ramps.
  const state = studioWithProduct()
  state.offices[0].kind = 'office'
  while (state.employees.length < 12) {
    state.employees.push({ ...generateEmployee(state, ROLES[state.employees.length % ROLES.length]), officeId: state.offices[0].id })
  }

  const original = sheetColours()
  const expected = new Set()
  for (const e of state.employees) {
    const { hair, shirt } = appearanceFor(e.id)
    for (const ramp of [hair > 0 ? HAIR_RAMPS[hair - 1] : null, shirt > 0 ? SHIRT_RAMPS[shirt - 1] : null]) {
      if (!ramp) continue
      for (const c of [ramp.dark, ramp.main, ramp.light]) if (!original.has((c[0] << 16) | (c[1] << 8) | c[2])) expected.add(c)
    }
  }

  const { page, close, problems, shot } = await openGame(browser, { save: serialize(state) })
  await sleep(1500)
  await shot('17-full-office')
  const image = PNG.sync.read(await page.screenshot())
  let hits = 0
  for (let i = 0; i < image.data.length; i += 4) {
    for (const c of expected) {
      if (Math.abs(image.data[i] - c[0]) <= 2 && Math.abs(image.data[i + 1] - c[1]) <= 2 && Math.abs(image.data[i + 2] - c[2]) <= 2) {
        hits += 1
        break
      }
    }
  }
  check('a full office shows recoloured hair and shirts on screen', expected.size > 0 && hits > 200, `${expected.size} ramp colours expected, ${hits} matching pixels`)
  check('looks scenario had no console errors', problems.length === 0, problems.join(' | '))
  await close()

  // On a phone the idle project panel stacks its line of text, centred, over a full-width button.
  // A wide phone, so the sentence fits on one line and can't fill the panel by wrapping.
  const phone = await openGame(browser, { width: 430, height: 860, save: serialize(studioWithProduct()) })
  await phone.waitFor('Start a project')
  await phone.shot('18-idle-panel-phone')
  const panel = await phone.page.evaluate(() => {
    const section = document.querySelector('.project.idle')
    const style = getComputedStyle(section)
    const inner = section.getBoundingClientRect()
    const left = inner.left + Number.parseFloat(style.paddingLeft)
    const right = inner.right - Number.parseFloat(style.paddingRight)
    const range = document.createRange()
    range.selectNodeContents(section.querySelector('.muted'))
    const words = range.getBoundingClientRect()
    const button = section.querySelector('button').getBoundingClientRect()
    return { left, right, words: [words.left, words.right], button: [button.left, button.right] }
  })
  const middle = (panel.left + panel.right) / 2
  check(
    'on a phone the idle panel centres its text over a full-width button',
    Math.abs((panel.words[0] + panel.words[1]) / 2 - middle) <= 2 &&
      Math.abs(panel.button[0] - panel.left) <= 1 &&
      Math.abs(panel.button[1] - panel.right) <= 1,
    JSON.stringify(panel),
  )
  check('idle panel on a phone had no console errors', phone.problems.length === 0, phone.problems.join(' | '))
  await phone.close()
}

async function scenarioPlay(browser) {
  const { page, close, problems, waitFor, click, stats, text } = await openGame(browser)
  await waitFor('New project')
  await page.evaluate(() => [...document.querySelectorAll('label')].find((l) => l.textContent.includes('User accounts'))?.click())
  await click('Start project')
  await click('2×')
  // A random event can turn up while the project runs (they start around day 25): answer it and carry on.
  const waitStart = Date.now()
  while (!(await text()).toLowerCase().includes('ready to ship')) {
    if (Date.now() - waitStart > 120000) throw new Error('timed out waiting for "Ready to ship"')
    const answered = await page.evaluate(() => {
      const choice = [...document.querySelectorAll('.event-choice')].find((b) => !b.disabled)
      choice?.click()
      return Boolean(choice)
    })
    await sleep(answered ? 400 : 200)
  }
  await click('Ship it')
  await waitFor('Launch')
  await click('Launch', '.modal')
  await waitFor('Released')
  check('a project can be started, finished and shipped', true)
  await click('Close')

  await click('Team')
  await click('Hire')
  await click('Close')
  check('hiring works', (await stats()).money !== formatMoney(START_MONEY))

  await click('Pause')
  await sleep(2600) // let the throttled autosave land
  const before = await stats()
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('.topbar')
  await sleep(1200)
  const after = await stats()
  check('reload resumes the saved game, paused', before.money === after.money && before.date === after.date && after.speed === 'Pause' && !after.dialog,
    `${before.money} ${before.date} -> ${after.money} ${after.date}`)

  // export / import round trip
  await page.evaluate(() => {
    const original = URL.createObjectURL
    window.__exported = null
    URL.createObjectURL = (blob) => {
      blob.text().then((t) => (window.__exported = t))
      return original.call(URL, blob)
    }
  })
  await click('Menu')
  await click('Export save')
  await sleep(400)
  const exported = await page.evaluate(() => window.__exported)
  let parsed = null
  try {
    parsed = JSON.parse(exported)
  } catch {
    // reported below
  }
  check('export produces a valid save', parsed?.version === STATE_VERSION && parsed.shippedCount === 1)
  const badFile = join(tmpdir(), 'tycoon-bad-save.json')
  writeFileSync(badFile, '{"version":1,"money":"lots"}')
  const chooser = page.waitForFileChooser()
  await click('Import save')
  await (await chooser).accept([badFile])
  await waitFor('not a save from this version', 5000)
  check('an invalid import is rejected with a message', true)

  await click('New game')
  await click('Really start over?')
  await sleep(1800)
  await waitFor('New project', 10000)
  const fresh = await stats()
  check('New game starts from scratch', fresh.money === formatMoney(START_MONEY) && fresh.date === 'Y1 M1 D1')
  check('play-through had no console errors', problems.length === 0, problems.join(' | '))
  await close()
}

const server = remoteUrl ? null : await startPreview()
const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: 'new',
  // Software GL so the PixiJS canvas works on machines without a GPU (CI, headless).
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})

try {
  console.log(`Testing ${BASE_URL}`)
  const scenarios = [
    ['load', scenarioLoad],
    ['event', scenarioEvent],
    ['research', scenarioResearch],
    ['lifecycle', scenarioLifecycle],
    ['launch', scenarioLaunch],
    ['fix', scenarioFix],
    ['journey', scenarioJourney],
    ['staff', scenarioStaff],
    ['stats', scenarioStats],
    ['sound', scenarioSound],
    ['looks', scenarioLooks],
  ]
  for (const [name, run] of scenarios) if (!ONLY || ONLY === name) await run(browser)
  if ((PLAY || ONLY === 'play') && (!ONLY || ONLY === 'play')) await scenarioPlay(browser)
} catch (error) {
  failures += 1
  console.error(`FAIL  ${error.message}`)
} finally {
  await browser.close()
  server?.kill()
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
