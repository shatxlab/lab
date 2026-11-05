import { useCareer } from './career-context'
import { useRef, useState, type ChangeEvent } from 'react'
import { withBase } from '@/lib/apps/paths'
import { downloadJournal, downloadSave, downloadSaveText, importSaveFile, startNewGame } from '@/lib/tycoon/browser'
import { STAGES } from '@/lib/tycoon/data/stages'
import { formatMoney } from '@/lib/tycoon/format'
import { ipoBlocker } from '@/lib/tycoon/sim/exit'
import { useGame, useSignal, useStore } from './context'
import { Modal } from './Modal'

export function MenuDialog() {
  const store = useStore()
  const career = useCareer()
  const state = useGame()
  const muted = useSignal(useStore().sfx.muted)
  const fileInput = useRef<HTMLInputElement>(null)
  const [confirmNew, setConfirmNew] = useState(false)
  const [confirmRetire, setConfirmRetire] = useState(false)
  const ipo = ipoBlocker(state)
  const [message, setMessage] = useState('')

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    try {
      const result = career ? await career.import(await file.text()) : await importSaveFile(file)
      if (!result.ok) setMessage(result.reason)
    } catch { setMessage('Could not read the selected file; the current career is unchanged.') }
  }
  const exportSave = () => {
    if (!career) return downloadSave(state)
    const result = career.exportSnapshot()
    if (result.ok) downloadSaveText(result.value)
    else setMessage(result.reason)
  }
  const retire = async () => {
    if (!confirmRetire) return setConfirmRetire(true)
    const result = career ? await career.end('retired') : store.retire()
    if (!result.ok) setMessage(result.reason)
  }
  const reset = async () => {
    if (!confirmNew) return setConfirmNew(true)
    if (!career) return startNewGame()
    const result = await career.reset()
    if (!result.ok) setMessage(result.reason)
  }

  return (
    <Modal title="Menu" onClose={() => store.closeDialog()}>
      <p className="muted">{career ? 'The game saves automatically in this browser. Export a file to back it up or move it elsewhere.' : 'Non-persistent developer preview. Real saves, imports and resets are disabled.'}</p>
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
        <button onClick={exportSave}>Export save</button>
        {career && <button onClick={() => store.openDialog({ kind: 'career' })}>Personal finance</button>}
        <button onClick={() => downloadJournal(state)}>Export run log</button>
        <button disabled={!career || career.busy.value} onClick={() => fileInput.current?.click()}>Import save…</button>
        {state.stage >= STAGES.length - 1 && (
          <button
            disabled={ipo !== null}
            onClick={() => store.openDialog({ kind: 'ipo' })}
            title={ipo ?? 'Celebrate your eligibility and review the IPO'}
          >
            {ipo ? `Go public: ${ipo}` : 'Go public (IPO)…'}
          </button>
        )}
        <button
          className={confirmRetire ? 'danger' : ''}
          disabled={career?.busy.value}
          onClick={() => void retire()}
          onBlur={() => setConfirmRetire(false)}
          title="End the run and see what the studio is worth"
        >
          {confirmRetire ? 'Really retire and end the run?' : 'Retire and see your legacy'}
        </button>
        <button
          className={confirmNew ? 'danger' : ''}
          disabled={!career || career.busy.value}
          onClick={() => void reset()}
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
