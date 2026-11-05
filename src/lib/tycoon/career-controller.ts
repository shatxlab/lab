// Durable browser controller: the island installs this together with every career writer.
import { createCareerAutosave } from './career-autosave'
import type { CareerPersistence } from './career-persistence'
import { deserializeCareerSave, serializeCareerSave, type CareerSave } from './career-save'
import type { CommittedCareer } from './career-transactions'
import type { ConsultingQuote } from './consulting'
import type { FoundingQuote } from './paid-founding'
import { signal } from './signals'
import { createStore, type Store } from './store'
import { acceptBuyout, goPublic, retireStudio } from './sim/exit'
import { financeSummary, type FinanceResult } from './sim/founder-finance'
import { createInitialState } from './sim/state'
import { foundStudio } from './sim/founding'
import type { SfxPlayer } from './audio'
import type { Result } from './sim/types'

const fail = (reason: string): FinanceResult<never> => ({ ok: false, reason })
export function createCareerController(owner: CareerPersistence, options: { sfx?: SfxPlayer; id?: () => string; onReplace?: () => void } = {}) {
  if (owner.token === null || owner.status !== 'ready') throw new Error('A career controller requires a committed, writable career')
  const loaded = deserializeCareerSave(owner.token)
  if (!loaded.ok) throw new Error(loaded.reason)
  let metadata = loaded.value
  const makeStore = (game: CareerSave['game']) => {
    const next = createStore(game, 0, { sfx: options.sfx })
    if (game.freshChapter) next.openDialog({ kind: 'founding' })
    return next
  }
  let base = makeStore(metadata.game)
  let stopped = false
  const version = signal(0), busy = signal(false), error = signal<string | null>(null)
  const id = (prefix: string) => `${prefix}:${(options.id ?? (() => crypto.randomUUID()))()}`
  const bump = () => { version.value++ }
  const snapshot = (): CareerSave => structuredClone({ ...metadata, game: base.state })
  const problem = (reason: string) => { error.value = reason; base.setSpeed(0); bump() }
  const acknowledge = (committed: CommittedCareer) => {
    const changed = JSON.stringify(metadata.finance) !== JSON.stringify(committed.save.finance) || JSON.stringify(metadata.charter) !== JSON.stringify(committed.save.charter)
    // Only acknowledge metadata: newer game commands, pending dialogs and transient events belong to Store.
    metadata = { ...committed.save, game: base.state }
    if (changed) bump()
  }
  const attach = () => createCareerAutosave(owner, { version: base.version, snapshot, acknowledge, onFailure: problem })
  let autosave = attach()
  const ui = new Set(['openDialog', 'closeDialog', 'selectOffice', 'selectProduct'])
  const endings = new Set(['retire', 'goPublic', 'acceptBuyout'])
  const wrap = (): Store => new Proxy(base, { get(target, key: keyof Store) {
    const value = target[key]
    if (typeof value !== 'function') return value
    if (key === 'running') return () => target === base && !stopped && !busy.value && !error.value && target.running()
    return (...args: unknown[]) => {
      if (target !== base || stopped || busy.value || error.value || (!ui.has(key) && target.state.gameOver))
        return key === 'tick' || key === 'setSpeed' || ui.has(key) ? undefined : fail('The company is paused or ended; resolve the career save first')
      if (endings.has(key)) return fail('Confirm this ending through the durable career controller')
      return Reflect.apply(value, target, args)
    }
  } })
  let store = wrap()
  const publish = (committed: CommittedCareer, replace: boolean) => {
    autosave.stop()
    metadata = committed.save
    if (replace) {
      base = makeStore(committed.save.game)
      store = wrap()
    } else {
      // Financial actions pause commands. Replacing their same-company draft cannot discard newer work.
      for (const key of Object.keys(base.state)) if (!(key in committed.save.game)) delete (base.state as unknown as Record<string, unknown>)[key]
      Object.assign(base.state, committed.save.game)
      if (base.state.gameOver) base.dialog.value = { kind: 'game-over' }
      base.version.value++
    }
    autosave = attach()
    bump()
    if (replace) options.onReplace?.()
  }
  async function run(action: () => Promise<FinanceResult<CommittedCareer>>, replace = false): Promise<Result> {
    if (stopped || busy.value) return fail('A career action is already running or this view was disposed')
    if (owner.status === 'conflict' || owner.status === 'unsupported') return fail('Reload this career before continuing; this view cannot safely save')
    busy.value = true; base.setSpeed(0); bump()
    try {
      const flushed = await autosave.flush()
      if (flushed && !flushed.ok) { problem(flushed.reason); return flushed }
      if (stopped) return fail('This career view was disposed')
      const result = await action()
      if (!result.ok) { problem(result.reason); return result }
      error.value = null
      if (!stopped) publish(result.value, replace)
      return { ok: true }
    } catch {
      problem('The career action could not complete; reload and inspect the saved career before retrying')
      return fail(error.value!)
    } finally { busy.value = false; bump() }
  }
  return {
    get store() { return store }, version, busy, error, snapshot, newId: id,
    async flush(): Promise<Result> {
      if (stopped) return fail('This career view was disposed')
      const result = await autosave.flush()
      if (result && !result.ok) { problem(result.reason); return result }
      if (owner.status === 'conflict' || owner.status === 'unsupported') return fail('This career cannot safely save; reload before continuing')
      error.value = null; bump()
      return { ok: true }
    },
    name(yourName: string, studioName: string) {
      return run(async () => { const draft = snapshot(); const result = foundStudio(draft.game, yourName, studioName); return result.ok ? owner.save(draft) : result })
    },
    end(kind: 'ipo' | 'sold' | 'retired') {
      return run(async () => {
        const draft = snapshot()
        const ended = kind === 'ipo' ? goPublic(draft.game) : kind === 'sold' ? acceptBuyout(draft.game) : retireStudio(draft.game)
        return ended.ok ? owner.save(draft) : ended
      })
    },
    decideLegacy(decision: 'apply' | 'decline') { return run(() => owner.settle(decision)) },
    found(quote: FoundingQuote) { const selected = structuredClone(quote); return run(() => owner.found(selected), true) },
    startConsulting(quote: ConsultingQuote) { const selected = structuredClone(quote); return run(() => owner.startConsulting(selected)) },
    advanceConsulting(days: number) { return run(() => owner.advanceConsulting(days)) },
    import(text: string) { const ids = { careerId: id('career'), companyId: id('company') }; return run(() => owner.import(text, ids), true) },
    reset(seed = Date.now()) {
      const game = createInitialState(seed), ids = { careerId: id('career'), companyId: id('company') }
      game.freshChapter = true
      return run(() => owner.reset(game, ids), true)
    },
    exportSnapshot() { return serializeCareerSave(snapshot()) },
    summary() { return financeSummary(metadata.finance) },
    stop() { stopped = true; autosave.stop(); owner.stop(); base.setSpeed(0); bump() },
  }
}
export type CareerController = ReturnType<typeof createCareerController>
