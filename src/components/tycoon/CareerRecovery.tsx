import { useState, type ChangeEvent } from 'react'
import { createCareerPersistence } from '@/lib/tycoon/career-persistence'
import type { CareerBoot } from '@/lib/tycoon/career-bootstrap'
import type { ExclusiveSaveLock } from '@/lib/tycoon/career-transactions'
import type { KeyValueStorage } from '@/lib/tycoon/save'
import { createInitialState } from '@/lib/tycoon/sim/state'
import { downloadSaveText } from '@/lib/tycoon/browser'

/** No Store/autosave exists behind this screen. Replacement requires an explicit, guarded user action. */
export function CareerRecovery({ failure, storage, lock }: { failure: Extract<CareerBoot, { ok: false }>; storage: KeyValueStorage | null; lock: ExclusiveSaveLock | null }) {
  const [message, setMessage] = useState(failure.reason), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false)
  const [owner] = useState(() => storage && lock && failure.readable ? createCareerPersistence(storage, lock, failure.raw) : null)
  const ids = () => ({ careerId: `career:${crypto.randomUUID()}`, companyId: `company:${crypto.randomUUID()}` })
  const file = async (e: ChangeEvent<HTMLInputElement>) => {
    const chosen = e.currentTarget.files?.[0]; e.currentTarget.value = ''
    if (!chosen || !owner || busy) return
    setBusy(true)
    try {
      const result = await owner.import(await chosen.text(), ids())
      if (result.ok) location.reload(); else setMessage(result.reason)
    } catch { setMessage('Could not read/import the selected file. The original is untouched.') }
    finally { setBusy(false) }
  }
  const reset = async () => {
    if (!owner || busy) return
    if (!confirm) return setConfirm(true)
    setBusy(true)
    const game = createInitialState(Date.now()); game.freshChapter = true
    const result = await owner.reset(game, ids())
    if (result.ok) location.reload(); else setMessage(result.reason)
    setBusy(false)
  }
  return <section className="career-recovery" aria-label="Career recovery">
    <h2>Your saved career needs attention</h2>
    <p role="alert">{message}</p><p>No new game or autosave has been started over this file.</p>
    {failure.raw !== null && <button onClick={() => downloadSaveText(failure.raw!)}>Export original file</button>}
    <button disabled={busy} onClick={() => location.reload()}>Retry loading</button>
    {owner && <><label>Import a supported backup<input type="file" accept="application/json,.json" disabled={busy} onChange={file} /></label>
      <button disabled={busy} onClick={() => void reset()}>{confirm ? 'Confirm: replace the saved career' : 'Start a separate new career'}</button>
      {confirm && <p className="warn">Export the original first. Confirmation discards its company, personal cash and holdings.</p>}</>}
  </section>
}
