import { useState } from 'react'
import { availableFixers, estimateFixDays, fixTarget, onCallUnlocked } from '@/lib/tycoon/sim/fixes'
import { getOffice, officeName } from '@/lib/tycoon/sim/offices'
import { overallProgress } from '@/lib/tycoon/sim/scoring'
import type { Employee, Fix, GameState, Product } from '@/lib/tycoon/sim/types'
import { formatDays } from '@/lib/tycoon/format'
import { useGame, useStore } from './context'

type FixRole = 'developer' | 'tester'

/** The skill that counts for the job: a developer's engineering, a tester's QA. */
const ROLE_SKILL = { developer: 'engineering', tester: 'qa' } as const
const SKILL_LABEL = { engineering: 'eng', qa: 'QA' } as const

/** "Ana · eng 62 · HQ": enough to choose by. */
function describe(state: GameState, person: Employee): string {
  const skill = ROLE_SKILL[person.role as FixRole]
  const office = getOffice(state, person.officeId)
  const where = state.offices.length > 1 && office ? ` · ${officeName(state, office)}` : ''
  return `${person.name} · ${SKILL_LABEL[skill]} ${Math.round(person.skills[skill])}${where}`
}

/** The best available person first, so the defaults are sensible. */
function bestFirst(state: GameState, role: FixRole): Employee[] {
  return availableFixers(state, role).sort((a, b) => b.skills[ROLE_SKILL[role]] - a.skills[ROLE_SKILL[role]])
}

/** Two selects, a developer and a tester, and a button for whatever the pair is for. */
function PairPicker({
  label,
  hint,
  developers,
  testers,
  onPick,
}: {
  label: string
  hint?: (developer: Employee, tester: Employee) => string
  developers: Employee[]
  testers: Employee[]
  onPick: (developer: Employee, tester: Employee) => void
}) {
  const state = useGame()
  const [developerId, setDeveloperId] = useState<number | null>(null)
  const [testerId, setTesterId] = useState<number | null>(null)
  const developer = developers.find((e) => e.id === developerId) ?? developers[0]
  const tester = testers.find((e) => e.id === testerId) ?? testers[0]

  if (!developer || !tester) {
    return <small className="muted">{!developer ? 'No free developer' : 'No free tester'}: a fixing pair needs one of each.</small>
  }
  return (
    <div className="pair-picker">
      <select aria-label="Developer" value={developer.id} onChange={(event) => setDeveloperId(Number((event.target as HTMLSelectElement).value))}>
        {developers.map((e) => (
          <option key={e.id} value={e.id}>
            {describe(state, e)}
          </option>
        ))}
      </select>
      <select aria-label="Tester" value={tester.id} onChange={(event) => setTesterId(Number((event.target as HTMLSelectElement).value))}>
        {testers.map((e) => (
          <option key={e.id} value={e.id}>
            {describe(state, e)}
          </option>
        ))}
      </select>
      <button className="primary" onClick={() => onPick(developer, tester)}>
        {label}
        {hint && <small> · {hint(developer, tester)}</small>}
      </button>
    </div>
  )
}

/** On a product: pick a pair and send them to fix its bugs. */
export function FixPicker({ product, onDone }: { product: Product; onDone: () => void }) {
  const store = useStore()
  const state = useGame()
  const bugs = Math.floor(product.bugs)
  return (
    <PairPicker
      label="Start fixing"
      developers={bestFirst(state, 'developer')}
      testers={bestFirst(state, 'tester')}
      hint={(developer, tester) => formatDays(estimateFixDays(state, bugs, developer, tester))}
      onPick={(developer, tester) => {
        const result = store.startFix(product.id, developer.id, tester.id)
        if (result.ok) onDone()
      }}
    />
  )
}

/** Incident management: the standing on-call pair. Shown once the research is done. */
export function OnCallPanel() {
  const store = useStore()
  const state = useGame()
  if (!onCallUnlocked(state)) return null
  const onCall = state.onCall
  const dev = state.employees.find((e) => e.id === onCall?.developerId)
  const tester = state.employees.find((e) => e.id === onCall?.testerId)

  return (
    <section className="on-call">
      <div className="section-head">
        <h3>On call</h3>
        <span className="muted">The pair picks up every bug as it is reported, buggiest product first, and works on its office's project whenever nothing is open.</span>
      </div>
      {onCall && dev && tester ? (
        <div className="product-actions">
          <span>
            <strong>{dev.name}</strong> + <strong>{tester.name}</strong>
          </span>
          <button onClick={() => store.clearOnCall()}>Stand down</button>
        </div>
      ) : (
        <PairPicker
          label="Put on call"
          developers={bestFirst(state, 'developer')}
          testers={bestFirst(state, 'tester')}
          onPick={(developer, tester) => store.setOnCall(developer.id, tester.id)}
        />
      )}
    </section>
  )
}

/** One running fixing job: who is on it, how far along, and a way to stop. */
function FixRow({ fix }: { fix: Fix }) {
  const store = useStore()
  const state = useGame()
  const product = state.products.find((p) => p.id === fix.productId)
  const developer = state.employees.find((e) => e.id === fix.developerId)
  const tester = state.employees.find((e) => e.id === fix.testerId)
  const done = Math.round(overallProgress(fix) * 100)
  const left = fixTarget(fix.bugs)
  return (
    <div className="fix-row">
      <span>
        🐞 <strong>{product?.name ?? 'Product'}</strong>
        <span className="muted">
          {' '}
          · {developer?.name ?? '?'} + {tester?.name ?? '?'}
          {fix.auto && ' · on call'} · {fix.bugsFixed} of {fix.bugs} fixed · {done}%
        </span>
      </span>
      <div className="track" aria-hidden="true" title={`${Math.round(fix.progress.engineering)}/${left.engineering} eng, ${Math.round(fix.progress.qa)}/${left.qa} QA`}>
        <div className="fill" style={{ width: `${done}%` }} />
      </div>
      <button onClick={() => store.stopFix(fix.id)}>Stop</button>
    </div>
  )
}

/** Every bug-fixing job in progress, under the project panel. */
export function ActiveFixes() {
  const state = useGame()
  if (state.fixes.length === 0) return null
  return (
    <div className="fixes">
      {state.fixes.map((fix) => (
        <FixRow key={fix.id} fix={fix} />
      ))}
    </div>
  )
}
