import { useRef, useState, type ChangeEvent } from 'react'
import { withBase } from '@/lib/apps/paths'
import { downloadSave, importSaveFile, startNewGame } from '@/lib/tycoon/browser'
import { useGame, useSignal, useStore } from './context'
import { Modal } from './Modal'

/** Viewport numbers for diagnosing installed-app (standalone) layout differences. */
function displayInfo(): string {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;height:100dvh;width:100vw;padding-bottom:env(safe-area-inset-bottom);padding-top:env(safe-area-inset-top)'
  document.body.appendChild(probe)
  const cs = getComputedStyle(probe)
  const info = [
    `inner ${innerWidth}×${innerHeight}`,
    `visual ${Math.round(visualViewport?.width ?? 0)}×${Math.round(visualViewport?.height ?? 0)}`,
    `100dvh ${Math.round(probe.getBoundingClientRect().height)}`,
    `safe top ${cs.paddingTop} bottom ${cs.paddingBottom}`,
    `screen ${screen.width}×${screen.height}`,
    matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser tab',
  ].join(' · ')
  probe.remove()
  return info
}

export function MenuDialog() {
  const store = useStore()
  const state = useGame()
  const muted = useSignal(useStore().sfx.muted)
  const fileInput = useRef<HTMLInputElement>(null)
  const [confirmNew, setConfirmNew] = useState(false)
  const [message, setMessage] = useState('')

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    const result = await importSaveFile(file)
    if (!result.ok) setMessage(result.reason)
  }

  return (
    <Modal title="Menu" onClose={() => store.closeDialog()}>
      <p className="muted">The game saves automatically in this browser. Export a file to back it up or move it elsewhere.</p>
      <div className="menu-actions">
        <button
          aria-pressed={!muted}
          onClick={() => {
            store.sfx.setMuted(!muted)
            store.sfx.play('click')
          }}
        >
          Sound: {muted ? 'Off' : 'On'}
        </button>
        <a className="button-link" href={withBase('/')}>
          Back to lab
        </a>
        <button onClick={() => downloadSave(state)}>Export save</button>
        <button onClick={() => fileInput.current?.click()}>Import save…</button>
        <button
          className={confirmNew ? 'danger' : ''}
          onClick={() => (confirmNew ? startNewGame() : setConfirmNew(true))}
          onBlur={() => setConfirmNew(false)}
        >
          {confirmNew ? 'Really start over?' : 'New game'}
        </button>
      </div>
      <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={onFile} />
      {message && <p className="bad">{message}</p>}
      <p className="muted credits">
        Art: Pixel Office by{' '}
        <a href="https://2dpig.itch.io/pixel-office" target="_blank" rel="noreferrer">
          2dPig
        </a>{' '}
        (CC0).
      </p>
      <p className="muted credits">Display: {displayInfo()}</p>
      <div className="actions">
        <button onClick={() => store.closeDialog()}>Close</button>
      </div>
    </Modal>
  )
}
