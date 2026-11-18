import { useEffect, useSyncExternalStore } from 'react'
import type { CareerController } from '@/lib/tycoon/career-controller'
import { CareerContext } from './career-context'
import { CareerFeedback } from './CareerFeedback'
import type { Store } from '@/lib/tycoon/store'
import { StoreContext, useGame } from './context'
import { BuildingOverlay } from './BuildingOverlay'
import { CashBanner } from './CashBanner'
import { DialogHost } from './DialogHost'
import { ActiveFixes } from './FixControls'
import { HitPanel } from './HitPanel'
import { ProjectPanel } from './ProjectPanel'
import { Toasts } from './Toasts'
import { TopBar } from './TopBar'
import { companyOverview } from '@/lib/tycoon/sim/offices'
import '@/styles/tycoon.css'

const noSubscribe = () => () => {}
export function App({ store: suppliedStore, career }: { store: Store; career?: CareerController }) {
  useSyncExternalStore(career?.version.subscribe ?? noSubscribe, () => career?.version.value ?? 0, () => 0)
  const store = career?.store ?? suppliedStore
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || store.dialog.value !== null) return
      // Space activates focused controls and types into fields; it is only a game hotkey off controls.
      const target = event.target
      if (target instanceof Element && target.closest('button, input, select, textarea, summary, a, [role="button"], [contenteditable]:not([contenteditable="false"])')) return
      event.preventDefault()
      store.setSpeed(store.speed.value === 0 ? 1 : 0)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [store])

  return (
    <CareerContext.Provider value={career ?? null}><StoreContext.Provider value={store}>
      <div className="game">
        <CareerFeedback /><TopBar />
        <Workspace />
        <DialogHost />
      </div>
    </StoreContext.Provider></CareerContext.Provider>
  )
}

/** Stable DOM/canvas host across expansion: only layout/labels change, never the scene element's identity. */
function Workspace() {
  const state = useGame()
  const overview = companyOverview(state)
  return <div className={`company-workspace${overview ? ' company-overview' : ''}`}>
    <div className="workspace-scene">
      <div id="scene-host" className="scene-host" aria-label={overview ? 'Company building overview' : 'Current workplace'}>
        <BuildingOverlay />
        <div className="scene-messages"><CashBanner /><Toasts /></div>
      </div>
    </div>
    <div className="workspace-operations" role={overview ? 'region' : undefined} aria-label={overview ? 'Operating workspace' : undefined}>
      <HitPanel /><ActiveFixes /><ProjectPanel />
    </div>
  </div>
}
