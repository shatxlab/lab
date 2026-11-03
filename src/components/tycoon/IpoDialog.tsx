import { useState } from 'react'
import { formatMoney } from '@/lib/tycoon/format'
import { ipoBlocker, ipoValuation } from '@/lib/tycoon/sim/exit'
import { studioNameOf } from '@/lib/tycoon/sim/founding'
import { useGame, useStore } from './context'
import { Modal } from './Modal'

/** Eligibility is an achievement, not an expiring buyer's offer. The player chooses when to end this chapter. */
export function IpoDialog() {
  const store = useStore()
  const state = useGame()
  const [confirm, setConfirm] = useState(false)
  const [message, setMessage] = useState('')
  const blocker = ipoBlocker(state)
  const value = formatMoney(ipoValuation(state))
  const proceed = () => {
    if (!confirm) return setConfirm(true)
    const result = store.goPublic()
    if (!result.ok) setMessage(result.reason)
  }

  return (
    <Modal title="Ready to ring the bell" onClose={() => store.closeDialog()} footer={
      <div className="actions">
        <button onClick={() => store.closeDialog()}>Keep running the company</button>
        <button className="primary" disabled={blocker !== null} onClick={proceed}>
          {confirm ? 'Confirm IPO and end this chapter' : 'Take the company public…'}
        </button>
      </div>
    }>
      <p className="ipo-achievement">From two laptops to a public company.</p>
      <p><strong>{studioNameOf(state)}</strong> has reached a major milestone: the scale, revenue and sustained profitability needed for an IPO.</p>
      <p>Estimated market valuation: <strong>{value}</strong>. This is what the company is valued at, not cash paid into your account.</p>
      <p>Going public rings the bell and <strong>ends this company’s chapter</strong>. You can review its legacy and start something new afterwards.</p>
      <p className="muted">There is no deadline. Keep building if you prefer; the IPO button stays in the top bar whenever you meet the requirements.</p>
      {confirm && <p className="warn" role="status">You are about to finish this chapter at a valuation of {value}. Ready to ring the bell?</p>}
      {(message || blocker) && <p className="bad" role="alert">{message || blocker}</p>}
    </Modal>
  )
}
