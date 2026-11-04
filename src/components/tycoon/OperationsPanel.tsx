import { useState } from 'react'
import { companionCoverage, companionEffects, companionsOf, companionHealthy, freeSlots } from '@/lib/tycoon/sim/companions'
import { RESEARCH } from '@/lib/tycoon/data/research'
import { DEEP_WORK } from '@/lib/tycoon/data/deepwork'
import { researchBlocker, researchDaysLeft } from '@/lib/tycoon/sim/research'
import { deepWorkBlocker } from '@/lib/tycoon/sim/deepwork'
import { strikeBackBlocker } from '@/lib/tycoon/sim/nemesis'
import { operationChoices, operationPreview, reassignmentCost, type OperationChoice, type Initiative } from '@/lib/tycoon/sim/operations'
import { officeName } from '@/lib/tycoon/sim/offices'
import { productService, serviceOutput } from '@/lib/tycoon/sim/services'
import { isReady, overallProgress } from '@/lib/tycoon/sim/scoring'
import { estimateDaysAt, teamRate } from '@/lib/tycoon/sim/work'
import { DISCIPLINES, emptySkills } from '@/lib/tycoon/sim/types'
import type { Office, Product } from '@/lib/tycoon/sim/types'
import { formatMoney } from '@/lib/tycoon/format'
import { CONTRACT_ABANDON_REPUTATION } from '@/lib/tycoon/sim/balance'
import { contractBalance } from '@/lib/tycoon/sim/contracts'
import { ClientWork } from './NewProjectDialog'
import { ProductOperations } from './ProductOperations'
import { BusinessPanel } from './BusinessPanel'
import { useGame, useOffice, useStore } from './context'

function AssignmentEditor({ office, product }: { office: Office; product: Product }) {
  const state = useGame()
  const store = useStore()
  const [selection, setSelection] = useState('')
  const [pending, setPending] = useState<OperationChoice | null>(null)
  const [error, setError] = useState('')
  const choices = operationChoices(state, product, office)
  const proposal = choices.find((p) => `${p.kind}:${p.id}` === selection)
  const preview = proposal ? operationPreview(state, office, product, { kind: proposal.kind, id: proposal.id }) : null
  const apply = (choice: OperationChoice, confirmed = false) => {
    if (!confirmed && (office.project || office.assignment?.kind !== 'idle')) { setPending(choice); setError(''); return }
    const result = store.assignOperation(office.id, choice, confirmed)
    setError(result.ok ? '' : result.reason)
    if (result.ok) { setPending(null); setSelection('') }
  }
  return <section className="plan operations-editor">
    <strong>Assign {officeName(state, office)}</strong>
    <small className="muted">One team, one responsibility. Other floors and the business keep running. Pause manually if you need time.</small>
    <label>Finite initiative
      <select value={selection} onChange={(event) => { setSelection(event.target.value); setPending(null) }}>
        <option value="">Choose an initiative…</option>
        {choices.map((p) => <option key={`${p.kind}:${p.id}`} value={`${p.kind}:${p.id}`}>{operationPreview(state, office, product, p as Parameters<typeof operationPreview>[3]).title}</option>)}
      </select>
    </label>
    {preview && proposal && <div className="initiative-contract">
      <strong>{preview.title} · {Number.isFinite(preview.days) ? `about ${preview.days} days` : 'blocked'}</strong>
      <p className="good">{preview.effect}</p>
      <p>Affects {product.name} at release. Demand, users and revenue follow later, not a guaranteed return.</p>
      <p>Upfront {formatMoney(preview.cash)} · added upkeep {formatMoney(preview.upkeep)}/day. Payroll, rent and hosting continue.</p>
      <p>Only this floor contributes. Clarity {preview.clarity}%. {DISCIPLINES.filter((d) => preview.target[d] > 0).map((d) => `${d}: ${Math.ceil(preview.target[d])} pts at ${preview.rate[d].toFixed(1)}/day`).join('; ')}.</p>
      {preview.blocker && <p className="warn">{preview.blocker}</p>}
      <button disabled={!!preview.blocker} onClick={() => apply({ kind: 'initiative', productId: product.id, proposal: { kind: proposal.kind as Initiative, id: proposal.id } })}>Assign initiative</button>
    </div>}
    <strong>Standing responsibility</strong>
    {(['reliability', 'growth', 'research'] as const).map((service) => {
      const output = serviceOutput(state, office, service)
      const total = productService(state, product, service)
      return <div className="operation-service" key={service}>
        <button disabled={output <= 0} onClick={() => apply({ kind: 'standing', service, productId: product.id })}>{service}</button>
        <small>This floor: {output.toFixed(1)} {total.unit}. Company coverage: {total.provided.toFixed(1)}/{total.demand.toFixed(1)}; headroom {total.headroom.toFixed(1)}.</small>
        <small className="muted">{service === 'reliability' ? 'Engineering + QA supply shared service points: companion care overhead first, then bug fixes split across the flagship and its companions. Existing bugs/fit and server capacity still constrain growth.' : service === 'growth' ? 'Analysts/designers support a campaign: up to +25% healthy organic demand-pull, shared across teams, not guaranteed users.' : 'Analysts/PMs contribute specialist days to the one paid research project. No engineers required. No selected project means no research progress.'}</small>
        {output <= 0 && <small className="warn">{service === 'research' ? 'Needs an analyst or PM.' : 'Missing required service skills.'}</small>}
        {total.risk && <small className="warn">{total.risk} {service === 'reliability' ? 'Unfixed bugs can reduce fit and retention.' : ''}</small>}
      </div>
    })}
    <button onClick={() => apply({ kind: 'idle' })}>Leave team idle</button>
    {pending && <div className="operation-confirm" role="group" aria-label="Confirm reassignment">
      <p>{reassignmentCost(office)}</p>
      <button onClick={() => apply(pending, true)}>Confirm reassignment</button>{' '}
      <button onClick={() => setPending(null)}>Cancel</button>
    </div>}
    {error && <p role="alert" className="warn">{error}</p>}
  </section>
}

export function OperationsPanel() {
  const state = useGame()
  const store = useStore()
  const office = useOffice()
  const [abandon, setAbandon] = useState(false)
  const [contractError, setContractError] = useState('')
  const [productId, setProductId] = useState(state.signatureId ?? state.products[0]?.id)
  const product = state.products.find((p) => p.id === productId) ?? state.products[0]
  const project = office.project
  const left = emptySkills()
  if (project) for (const d of DISCIPLINES) left[d] = Math.max(0, project.target[d] - project.progress[d])
  const days = project ? estimateDaysAt(left, teamRate(state, office, { typeId: project.productTypeId, productId: project.parentId })) : 0
  const companions = companionsOf(state)
  const effects = companionEffects(state)
  const active = state.research.active
  const researchLeft = researchDaysLeft(state)
  return <div className="hit-panel operations-panel" aria-label="Company operations">
    <div className="plan-head"><strong>Company operations</strong><small className="muted">Independent teams · no automatic assignments</small></div>
    <nav className="operations-teams" aria-label="Delivery teams">{state.offices.map((o) => <button key={o.id} aria-pressed={o.id === office.id} onClick={() => store.selectOffice(o.id)}>
      <strong>{officeName(state, o)}</strong><small>{o.project ? o.project.name : o.assignment?.kind === 'standing' ? o.assignment.service : 'Idle — awaiting assignment'}</small>
    </button>)}</nav>
    {project && <section className="plan build"><strong>{project.name}</strong><small>{Number.isFinite(days) ? `About ${days} days remaining` : 'Blocked: missing required build skills'}. Only this team contributes.</small>
      {project.contract && <div>
        <p>Client deadline: day {project.contract.dueDay}. Remaining payment if delivered today: {formatMoney(contractBalance(state, project.contract))}. Late delivery loses the second half; no team can also take an initiative.</p>
        <button onClick={() => setAbandon(true)}>Abandon client work…</button>
        {abandon && <div role="group" aria-label="Confirm contract abandonment">
          <p>Returns {formatMoney(project.contract.deposit ?? 0)} deposit and loses {CONTRACT_ABANDON_REPUTATION} reputation. All progress is lost.</p>
          <button onClick={() => { const result = store.abandonContract(office.id); setContractError(result.ok ? '' : result.reason); if (result.ok) setAbandon(false) }}>Confirm abandonment</button>{' '}
          <button onClick={() => setAbandon(false)}>Cancel</button>
        </div>}
        {contractError && <p role="alert">{contractError}</p>}
      </div>}
      {!project.byTeam && project.kind !== 'contract' && <button disabled={!isReady(project)} onClick={() => store.shipProject(undefined, office.id)}>Ship carried-over project</button>}
      <div className="track"><div className="fill" style={{ width: `${Math.min(1, overallProgress(project)) * 100}%` }} /></div>
    </section>}
    {!project && office.assignment?.kind === 'idle' && <p className="warn">This team is idle. Other teams and the business continue; payroll still applies.</p>}
    {office.assignment?.kind === 'standing' && <p>Assigned: <strong>{office.assignment.service}</strong>. Continues until you reassign this team.</p>}
    {product && <><label>Product / ecosystem context <select value={product.id} onChange={(e) => setProductId(Number(e.target.value))}>{state.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <AssignmentEditor key={`${office.id}:${product.id}`} office={office} product={product} />
      <ProductOperations key={product.id} product={product} />
      <details className="plan"><summary>Client & enterprise work · {officeName(state, office)}</summary>
        <p>Uses this floor only. Finish or explicitly abandon its current work, and stop standing coverage before taking a job. Estimates and deadlines apply to this team, not spare company capacity.</p>
        <ClientWork key={`${office.id}:${product.id}`} office={office} productId={product.id} />
      </details></>}
    {companions.length > 0 && <section className="plan" aria-label="Ecosystem health">
      <strong>Flagship ecosystem · {freeSlots(state)} of 2 slots free</strong>
      <p>Shared reliability coverage: {Math.round(companionCoverage(state) * 100)}%. Bonuses scale with coverage; stale or buggy companions provide no bonus. Reassign capacity or ship an update to recover.</p>
      <p>Current flagship bonuses: +{Math.round(effects.reach * 100)}% reach · +{Math.round(effects.retention * 100)}% retention · +{Math.round(effects.pay * 100)}% pay.</p>
      {companions.map((p) => <p key={p.id}>{p.name}: {companionHealthy(state, p) ? 'fresh and healthy' : 'needs an update or bug fixes'} · {Math.ceil(p.bugs)} open bugs. Select this product above to assign an update.</p>)}
    </section>}
    <details className="plan"><summary>Technology research & founder work</summary>
      {active ? <p>{RESEARCH.find((node) => node.id === active.id)?.name}: {Number.isFinite(researchLeft) ? `about ${researchLeft} days left` : 'stalled — assign analysts to research'}</p> : <p>Research needs a paid project and a standing research team.</p>}
      {!active && RESEARCH.filter((node) => !node.repeatable && researchBlocker(state, node) === null).map((node) => <button key={node.id} onClick={() => store.startResearch(node.id)}>{node.name} · {formatMoney(node.cost)} · {node.days} specialist days</button>)}
      {state.deepWork ? <p>Founder deep work: {state.deepWork.kind}. Delivery teams continue; the founder is not counted twice.</p> : DEEP_WORK.filter((kind) => deepWorkBlocker(state, kind.id) === null).map((kind) => <button key={kind.id} onClick={() => store.startDeepWork(kind.id)}>{kind.name} · {kind.days} days of founder time</button>)}
      <button disabled={strikeBackBlocker(state) !== null} onClick={() => store.strikeBack()}>Strike back</button>
    </details>
    <BusinessPanel />
  </div>
}
