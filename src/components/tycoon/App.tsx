import { useEffect } from 'react'
import type { Store } from '@/lib/tycoon/store'
import { StoreContext } from './context'
import { CashBanner } from './CashBanner'
import { DialogHost } from './DialogHost'
import { OfficeTabs } from './OfficeTabs'
import { ActiveFixes } from './FixControls'
import { ProjectPanel } from './ProjectPanel'
import { Toasts } from './Toasts'
import { TopBar } from './TopBar'
import '@/styles/tycoon.css'

export function App({ store }: { store: Store }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || store.dialog.value !== null) return
      event.preventDefault()
      store.setSpeed(store.speed.value === 0 ? 1 : 0)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [store])

  return (
    <StoreContext.Provider value={store}>
      <div className="game">
        <TopBar />
        <div id="scene-host" className="scene-host">
          {/* Messages sit over the top of the office wall, just under the top-bar buttons. */}
          <div className="scene-messages">
            <CashBanner />
            <Toasts />
          </div>
        </div>
        <OfficeTabs />
        <ActiveFixes />
        <ProjectPanel />
        <DialogHost />
      </div>
    </StoreContext.Provider>
  )
}
