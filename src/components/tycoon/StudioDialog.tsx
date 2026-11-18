import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { studioLocation, type StudioLink, type StudioTab } from '@/lib/tycoon/studio-navigation'
import { formatMoney } from '@/lib/tycoon/format'
import { inGarage } from '@/lib/tycoon/sim/offices'
import { operating } from '@/lib/tycoon/sim/services'
import { CompanyTab } from './CompanyTab'
import { IndustryTab } from './IndustryTab'
import { JourneyTab } from './JourneyTab'
import { Modal } from './Modal'
import { MilestonesTab } from './MilestonesTab'
import { ProductsTab } from './ProductsTab'
import { StatsTab } from './StatsTab'
import { useGame, useStore } from './context'

const TABS: readonly { id: StudioTab; label: string }[] = [
  { id: 'company', label: 'Company' },
  { id: 'industry', label: 'Industry' },
  { id: 'journey', label: 'Journey' },
  { id: 'products', label: 'Products' },
]

/** Mount expensive tables/charts only when requested, at their visible width. */
function Section({ title, initiallyOpen, children }: { title: string; initiallyOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(initiallyOpen ?? false)
  return <details className="studio-section" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>{title}</summary>{open && children}
  </details>
}

/** Company owns its metrics/ecosystem; Journey owns chapters/achievements. Discovery stays available before Operations. */
export function StudioDialog({ tab: initial }: { tab?: StudioLink }) {
  const store = useStore()
  const state = useGame()
  const managed = operating(state)
  const hasHit = state.signatureId !== null && !inGarage(state)
  const [location, setLocation] = useState(() => studioLocation(initial, hasHit, managed))
  // If Operations starts while a legacy discovery link is mounted, don't strand an invisible selected tab.
  const { tab, section } = studioLocation(location.tab, hasHit, managed)
  const focusSection = section ?? location.section
  const tabs = TABS.filter((t) => t.id !== 'products' || !managed)
  const select = (next: StudioTab) => setLocation({ tab: next, section: null })
  const keys = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : null
    if (next === null) return
    event.preventDefault()
    select(tabs[next].id)
    document.getElementById(`studio-tab-${tabs[next].id}`)?.focus()
  }
  return <Modal title="Studio" onClose={() => store.closeDialog()} footer={
    <div className="actions"><button onClick={() => store.closeDialog()}>Close</button></div>
  }>
    <div className="tabs" role="tablist" aria-label="Studio">
      {tabs.map((t, i) => <button key={t.id} id={`studio-tab-${t.id}`} role="tab" aria-selected={t.id === tab}
        aria-controls={`studio-panel-${t.id}`} tabIndex={t.id === tab ? 0 : -1}
        className={t.id === tab ? 'active' : ''} onClick={() => select(t.id)} onKeyDown={(event) => keys(event, i)}>{t.label}</button>)}
    </div>
    <div key={`${tab}:${focusSection}`} id={`studio-panel-${tab}`} className="tab-panel" role="tabpanel" aria-labelledby={`studio-tab-${tab}`}>
      {tab === 'company' && <>
        {hasHit ? <CompanyTab /> : <p>No signature company yet. Discover a product and grow the studio.</p>}
        {managed && <Section title="Products & ecosystem" initiallyOpen={focusSection === 'ecosystem'}><ProductsTab /></Section>}
        <Section title="Company metrics & history" initiallyOpen={focusSection === 'metrics'}><StatsTab /></Section>
      </>}
      {tab === 'industry' && <IndustryTab />}
      {tab === 'products' && <ProductsTab />}
      {tab === 'journey' && <>
        <JourneyTab />
        <Section title="Company chapters">
          <p>Current company: {state.chapter ?? 1}.</p>
          {state.legacy?.length ? <ol>{state.legacy.map((entry, i) => <li key={i}>
            <strong>{entry.studio}</strong> · {entry.ending} · {entry.years.toFixed(1)} years · historical valuation {formatMoney(entry.worth)}
          </li>)}</ol> : <p>No earlier company chapters yet.</p>}
          <p className="muted">Historical valuations are not founder cash or proceeds available to invest.</p>
        </Section>
        <Section title="Milestones & rewards" initiallyOpen={focusSection === 'milestones'}><MilestonesTab /></Section>
      </>}
    </div>
  </Modal>
}
