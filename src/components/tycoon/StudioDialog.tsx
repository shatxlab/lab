import { useState } from 'react'
import { AgentsTab } from './AgentsTab'
import { IndustryTab } from './IndustryTab'
import { JourneyTab } from './JourneyTab'
import { Modal } from './Modal'
import { MilestonesTab } from './MilestonesTab'
import { ProductsTab } from './ProductsTab'
import { StatsTab } from './StatsTab'
import { useStore } from './context'

type Tab = 'journey' | 'products' | 'agents' | 'industry' | 'stats' | 'milestones'

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'journey', label: 'Journey' },
  { id: 'products', label: 'Products' },
  { id: 'agents', label: 'Agents' },
  { id: 'industry', label: 'Industry' },
  { id: 'stats', label: 'Stats' },
  { id: 'milestones', label: 'Milestones' },
]

/** The studio's record: where it is headed, what it has shipped, how it has done over time, and what it has achieved. */
export function StudioDialog({ tab: initial = 'products' }: { tab?: Tab }) {
  const store = useStore()
  const [tab, setTab] = useState<Tab>(initial)

  return (
    <Modal title="Studio" onClose={() => store.closeDialog()}>
      <div className="tabs" role="tablist" aria-label="Studio">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={t.id === tab} className={t.id === tab ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="tab-panel" role="tabpanel">
        {tab === 'journey' && <JourneyTab />}
        {tab === 'products' && <ProductsTab />}
        {tab === 'agents' && <AgentsTab />}
        {tab === 'industry' && <IndustryTab />}
        {tab === 'stats' && <StatsTab />}
        {tab === 'milestones' && <MilestonesTab />}
      </div>
      <div className="actions">
        <button onClick={() => store.closeDialog()}>Close</button>
      </div>
    </Modal>
  )
}
