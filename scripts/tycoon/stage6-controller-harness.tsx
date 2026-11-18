// Test-only prepared controller/UI host; never imported by TycoonApp.
// npx esbuild scripts/tycoon/stage6-controller-harness.tsx --bundle --platform=browser --format=iife --jsx=automatic --define:import.meta.env.BASE_URL='"/"' --global-name=CareerUIHarness --alias:@=./src --outfile=/tmp/stage6-controller-harness.js
import { createRoot, type Root } from 'react-dom/client'
import { App } from '../../src/components/tycoon/App'
import { createCareerController, type CareerController } from '../../src/lib/tycoon/career-controller'
import { createCareerPersistence } from '../../src/lib/tycoon/career-persistence'
import { browserCareerLock } from '../../src/lib/tycoon/career-transactions'
import { adoptCareerSave, createCareerSave, serializeCareerSave, settleCareerSave } from '../../src/lib/tycoon/career-save'
import { SAVE_KEY } from '../../src/lib/tycoon/save'
import { createInitialState, serialize } from '../../src/lib/tycoon/sim/state'
import { paidFoundingSource, unwrap } from '../../tests/tycoon/paid-founding-fixtures'
let controller: CareerController, root: Root, blocked = false
export function current() { return controller }
export function setBlocked(value: boolean) { blocked = value }
export function mount(kind: 'paid' | 'legacy' | 'bankrupt' | 'resume') {
  if (kind !== 'resume') {
    let save = paidFoundingSource()
    if (kind === 'legacy') save = unwrap(adoptCareerSave(serialize(save.game), { careerId: 'synthetic-legacy', companyId: 'legacy-current' }))
    if (kind === 'bankrupt') {
      save = unwrap(createCareerSave(createInitialState(5), { careerId: 'synthetic-bankrupt', companyId: 'bankrupt-current' }))
      save.game.day = 500; save.game.money = -100; save.game.gameOver = true; save.game.ending = { kind: 'bankrupt', day: 500, worth: 0 }
      save = unwrap(settleCareerSave(save))
    }
    localStorage.setItem(SAVE_KEY, unwrap(serializeCareerSave(save))) // Synthetic fixture injection only.
  }
  const storage = { getItem: (k: string) => localStorage.getItem(k), removeItem: (k: string) => localStorage.removeItem(k), setItem: (k: string, v: string) => {
    if (blocked) throw new DOMException('Synthetic quota', 'QuotaExceededError')
    localStorage.setItem(k, v)
  } }
  controller = createCareerController(createCareerPersistence(storage, browserCareerLock(), localStorage.getItem(SAVE_KEY)))
  root = createRoot(document.querySelector('#career-test')!)
  root.render(<App store={controller.store} career={controller} />)
}
export function unmount() { controller.stop(); root.unmount() }
