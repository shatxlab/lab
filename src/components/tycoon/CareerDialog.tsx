import { useState } from 'react'
import { downloadJournal, downloadSaveText } from '@/lib/tycoon/browser'
import { currentExitFacts } from '@/lib/tycoon/career-save'
import { quoteConsulting } from '@/lib/tycoon/consulting'
import { foundingOffers, quoteFounding } from '@/lib/tycoon/paid-founding'
import { PRODUCT_TYPES } from '@/lib/tycoon/data/productTypes'
import { eraIndexAt } from '@/lib/tycoon/data/eras'
import { quoteDistribution, type VentureAmbition } from '@/lib/tycoon/sim/founder-finance'
import { NAME_MAX, you } from '@/lib/tycoon/sim/founding'
import { ResearchCarryover } from './ResearchCarryover'
import { useCareer } from './career-context'
import { useGame, useStore } from './context'
import { Modal } from './Modal'

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 })
const money = (n: number) => currency.format(n)

/** Career finance is separate from the ended company's corporate balance and historical valuations. */
export function CareerDialog() {
  const career = useCareer()!
  const store = useStore(), state = useGame()
  const source = career.snapshot(), summary = career.summary()
  const [confirmReset, setConfirmReset] = useState(false)
  const [message, setMessage] = useState('')
  if (!summary.ok) return <Modal title="Career unavailable"><p role="alert">{summary.reason}</p></Modal>
  const finance = summary.value, current = finance.companies.at(-1)!
  const facts = currentExitFacts(state)
  const adoption = facts && current.source === 'legacy-ended' && !current.closed ? quoteDistribution(5000, facts) : null
  const years = ((state.ending?.day ?? state.day) - (state.chapterStartDay ?? 0)) / 360
  const disabled = career.busy.value
  return <Modal title={state.gameOver ? 'Your next chapter' : 'Personal finance'} onClose={state.gameOver ? undefined : () => store.closeDialog()} footer={
    <div className="actions">
      <button onClick={() => { const file = career.exportSnapshot(); if (file.ok) downloadSaveText(file.value); else setMessage(file.reason) }}>Export backup</button>
      <button onClick={() => downloadJournal(state)}>Run log</button>
      {!state.gameOver && <button onClick={() => store.closeDialog()}>Close</button>}
      {state.gameOver && <button disabled={disabled} onClick={() => {
        if (!confirmReset) return setConfirmReset(true)
        void career.reset()
      }}>{confirmReset ? 'Confirm: discard this career' : 'Start a separate new career'}</button>}
    </div>
  }>
    {message && <p role="alert" className="bad">{message}</p>}
    <p><strong>{you(state)?.name}</strong> · {state.gameOver ? `Company ended: ${state.ending?.kind}` : state.studioName} · company tenure {years.toFixed(1)} years.</p>
    <dl className="career-figures">
      <div><dt>Spendable personal cash</dt><dd>{money(finance.liquid)}</dd></div>
      <div><dt>{state.gameOver ? 'Closing company cash (not your wallet)' : 'Company cash (not your wallet)'}</dt><dd>{money(state.money)}</dd></div>
      <div><dt>Your frozen founding stake</dt><dd>{current.shareBps / 100}%{current.source.startsWith('legacy') ? ' · prototype assumption' : ''}</dd></div>
      <div><dt>Recorded closed companies / fulfilled ambitions</dt><dd>{finance.companies.filter((c) => c.closed).length} / {finance.fulfilledAmbitions.length}</dd></div>
    </dl>
    <p className="muted">Company valuations and retained holdings are not spendable cash. Career standing gives no hidden buffs or startup grants.</p>
    {finance.holdings.length > 0 && <section className="career-history"><h3>Retained holdings</h3><ul>{finance.holdings.map((h) => <li key={h.companyId}>{h.companyId}: {h.status} · {h.bookValue === null ? 'unpriced' : money(h.bookValue)} · not spendable</li>)}</ul></section>}
    {state.legacy?.length ? <details className="career-history"><summary>Historical company valuations · not spendable</summary><p>Older valuations without a recorded settlement have unknown proceeds. Actual credits are listed separately below; history is never cashed out again.</p><ul>{state.legacy.map((l, i) => <li key={i}>{l.studio}: {money(l.worth)} valuation</li>)}</ul></details> : null}
    {source.finance.records.some((r) => r.kind === 'settlement') && <details className="career-history"><summary>Recorded settlements · cash already booked</summary><ul>{source.finance.records.map((r, i) => r.kind === 'settlement' ? <li key={i}>{r.companyId} · {r.facts.kind}: {money(r.distribution.liquid)} personal cash credited once{r.legacyOptIn ? ' · explicit prototype assumption' : ''}. {r.distribution.holding ? 'Retained valuation is not spendable.' : 'No retained holding.'}</li> : null)}</ul></details>}
    {finance.fulfilledAmbitions.length > 0 && <details className="career-history"><summary>Fulfilled ambitions · no cash reward</summary><ul>{finance.fulfilledAmbitions.map((a) => <li key={a.companyId}>{a.ambition} · day {a.day}. IPO still checks current company readiness.</li>)}</ul></details>}
    {confirmReset && <p className="warn">This discards personal cash, holdings and the current career. Export a backup first. It is not a funded successor.</p>}
    {state.gameOver && <ResearchCarryover />}
    {adoption?.ok ? <section className="career-section"><h3>Choose legacy settlement</h3>
      <p>Historical ownership was not recorded. Apply the prototype <strong>50% assumed stake</strong> to this current ending once, or leave proceeds unpriced. Earlier companies are never cashed out.</p>
      <p>Exact personal credit: <strong>{money(adoption.value.liquid)}</strong>. Retained holding: {adoption.value.holding?.bookValue === null ? 'unpriced' : money(adoption.value.holding?.bookValue ?? 0)} (not spendable).</p>
      <div className="actions"><button disabled={disabled} onClick={() => void career.decideLegacy('apply')}>Apply prototype settlement</button><button disabled={disabled} onClick={() => void career.decideLegacy('decline')}>Leave proceeds unpriced</button></div>
    </section> : state.gameOver && !current.closed ? <section><p>Save this ending before planning another company. No personal proceeds are available until it is stored.</p><button disabled={disabled} onClick={() => void career.flush()}>Save closing settlement</button></section> : null}
    {state.gameOver && current.closed && <>
      <Consulting key={`${source.game.day}:${source.finance.records.length}`} />
      {!finance.consulting && <NextVenture key={source.charter.companyId} />}
    </>}
  </Modal>
}

function Consulting() {
  const career = useCareer()!, state = useGame()
  const [contractId] = useState(() => career.newId('contract'))
  const summary = career.summary()
  if (!summary.ok) return null
  const pending = summary.value.consulting
  const quote = pending ? null : quoteConsulting(career.snapshot(), contractId)
  const disabled = career.busy.value
  return <section className="career-section"><h3>Paid consulting</h3>
    {pending ? <>
      <p>Contract in progress: <strong>{pending.completeDay - state.day} game days remaining</strong>. Frozen payout: <strong>{money(pending.payout)}</strong>; not credited yet.</p>
      <p>World day {state.day}. Work saves partial progress. The old company stays ended, without wages, revenue, research or skill gains.</p>
      <div className="actions"><button disabled={disabled} onClick={() => void career.advanceConsulting(1)}>Work 1 day</button><button disabled={disabled} onClick={() => void career.advanceConsulting(7)}>Work 7 days</button><button disabled={disabled} onClick={() => void career.advanceConsulting(pending.completeDay - state.day)}>Finish contract ({pending.completeDay - state.day} days)</button></div>
    </> : quote?.ok ? <>
      <p>One explicit <strong>30-game-day</strong> contract: full market monthly salary {money(quote.value.marketSalary)}, personal payout <strong>{money(quote.value.payout)}</strong> after living costs. Pay is frozen now and credited only on completion.</p>
      <p className="muted">No real-time wait or automatic next contract. World, rivals and market advance; personal skills and the ended company do not.</p>
      <button disabled={disabled} onClick={() => void career.startConsulting(quote.value)}>Accept 30-day consulting contract</button>
    </> : <p className="bad">{quote && !quote.ok ? quote.reason : ''}</p>}
  </section>
}

function NextVenture() {
  const career = useCareer()!, state = useGame()
  const [companyId] = useState(() => career.newId('company'))
  const [name, setName] = useState('')
  const [ambition, setAmbition] = useState<VentureAmbition>('modest')
  const [focus, setFocus] = useState('web_app')
  const [candidates, setCandidates] = useState<number[]>([])
  const [amount, setAmount] = useState('')
  const source = career.snapshot()
  const offers = foundingOffers(source)
  const quote = quoteFounding(source, { companyId, companyName: name, ambition, focus, candidateIds: candidates,
    ...(amount === '' ? {} : { investment: Number(amount) }) })
  const q = quote.ok ? quote.value : null
  return <section className="career-section"><h3>Fund a new company</h3>
    <p>Your identity and learned skills carry on. Choose one company name. No free staff, products, research or regional capacity.</p>
    <details><summary>Product-family progression</summary><p>After you actually ship a signature hit, professional-product traffic and initiative thresholds use fixed base-price equivalence to Web App users (never current cash, deals or monetisation upgrades). Consumer targets do not rise. The $1 billion revenue, profitability and charter requirements remain. Standard and legacy companies keep their existing rules.</p></details>
    <form className="career-form" onSubmit={(e) => { e.preventDefault(); if (q?.affordable) void career.found(q) }}>
      <label>Company name<input value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.currentTarget.value)} autoComplete="off" /></label>
      <label>Ambition<select aria-label="Ambition" value={ambition} onChange={(e) => setAmbition(e.currentTarget.value as VentureAmbition)}>
        <option value="modest">Modest · café</option><option value="studio">Studio · garage</option><option value="venture">Venture · rented US floor</option>
      </select></label>
      <label>Product focus (planning only)<select aria-label="Product focus (planning only)" value={focus} onChange={(e) => setFocus(e.currentTarget.value)}>{PRODUCT_TYPES.filter((t) => t.era <= eraIndexAt(state.day)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <fieldset><legend>Actual local hires · signing and payroll are charged</legend>
        {offers.ok ? <>{offers.value.founders.map((p) => <p key={p.id}>{p.name} · returning {p.role}</p>)}{offers.value.offers.map((p) => <label className="career-hire" key={p.id}><input type="checkbox" checked={candidates.includes(p.id)} onChange={(e) => { const checked = e.currentTarget.checked; setCandidates((ids) => checked ? [...ids, p.id] : ids.filter((id) => id !== p.id)) }} />{p.name} · {p.role} · {money(p.salary)}/month</label>)}</> : <p className="bad">{offers.reason}</p>}
      </fieldset>
      <label>Personal investment · whole dollars (blank uses recommended)<input type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.currentTarget.value)} /></label>
      {q ? <><dl className="career-figures">
        <div><dt>Available personal cash</dt><dd>{money(q.available)}</dd></div><div><dt>Minimum / recommended investment</dt><dd>{money(q.minimum)} / {money(q.recommended)}</dd></div>
        <div><dt>Setup / signing fees</dt><dd>{money(q.costs.setup)} / {money(q.costs.signing)}</dd></div><div><dt>Build allowance / monthly burn</dt><dd>{money(q.costs.buildAllowance)} / {money(q.costs.monthlyBurn)}</dd></div>
        <div><dt>Company cash after setup</dt><dd>{money(q.companyCash)}</dd></div><div><dt>Personal reserve after transfer</dt><dd>{money(q.privateReserve)}</dd></div>
        <div><dt>Build-reserved runway</dt><dd>{q.runwayMonths === null ? 'No recurring burn' : `${q.runwayMonths.toFixed(2)} months`}</dd></div><div><dt>Staff / desks</dt><dd>{q.staff.length} / {q.desks}</dd></div>
      </dl><p>Actual quoted payroll: {q.staff.map((p) => `${p.name}: ${money(p.salary)}/month`).join(' · ')}</p><div className="actions"><button type="button" onClick={() => setAmount(String(q.minimum))}>Use minimum</button><button type="button" onClick={() => setAmount(String(q.recommended))}>Use recommended</button></div>
        {q.blocker && <p className="bad" role="status">{q.blocker}</p>}
      </> : <p className="muted" role="status">{!name.trim() ? 'Enter a company name to preview the investment.' : quote.ok ? '' : quote.reason}</p>}
      <p className="muted">Charter: {ambition === 'modest' ? 'Medium+ signature, one effective delivery floor, 90 profitable days.' : ambition === 'studio' ? 'Large+ signature, two capable floors, shared reliability, 90 profitable days.' : 'Flagship, three capable floors including Europe, shared reliability, 180 profitable days and the normal rival-win achievement.'} All need a healthy live hit; existing IPO rules also apply.</p>
      <button className="primary" type="submit" disabled={career.busy.value || !q?.affordable}>Confirm investment and found company</button>
    </form>
  </section>
}
