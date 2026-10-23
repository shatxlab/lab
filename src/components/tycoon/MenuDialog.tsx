import { useRef, useState, type ChangeEvent } from 'react'
import { withBase } from '@/lib/apps/paths'
import { downloadJournal, downloadSave, importSaveFile, startNewGame } from '@/lib/tycoon/browser'
import { STAGES } from '@/lib/tycoon/data/stages'
import { formatMoney } from '@/lib/tycoon/format'
import { ipoBlocker, ipoValuation } from '@/lib/tycoon/sim/exit'
import { useGame, useSignal, useStore } from './context'
import { Modal } from './Modal'

export function MenuDialog() {
  const store = useStore()
  const state = useGame()
  const muted = useSignal(useStore().sfx.muted)
  const fileInput = useRef<HTMLInputElement>(null)
  const [confirmNew, setConfirmNew] = useState(false)
  const [confirmRetire, setConfirmRetire] = useState(false)
  const [confirmIpo, setConfirmIpo] = useState(false)
  const ipo = ipoBlocker(state)
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
        <button onClick={() => downloadJournal(state)}>Export run log</button>
        <button onClick={() => fileInput.current?.click()}>Import save…</button>
        {state.stage >= STAGES.length - 1 && (
          <button
            className={confirmIpo ? 'danger' : ''}
            disabled={ipo !== null}
            onClick={() => (confirmIpo ? store.goPublic() : setConfirmIpo(true))}
            onBlur={() => setConfirmIpo(false)}
            title={ipo ?? `Ring the bell: the company is valued at ${formatMoney(ipoValuation(state))} and the run ends`}
          >
            {ipo ? `Go public: ${ipo}` : confirmIpo ? `Really go public at ${formatMoney(ipoValuation(state))}? This ends the run` : 'Go public (IPO)'}
          </button>
        )}
        <button
          className={confirmRetire ? 'danger' : ''}
          onClick={() => (confirmRetire ? store.retire() : setConfirmRetire(true))}
          onBlur={() => setConfirmRetire(false)}
          title="End the run and see what the studio is worth"
        >
          {confirmRetire ? 'Really retire and end the run?' : 'Retire and see your legacy'}
        </button>
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
      <div className="actions">
        <button onClick={() => store.closeDialog()}>Close</button>
      </div>
    </Modal>
  )
}
