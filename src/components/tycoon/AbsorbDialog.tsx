import { useState } from 'react'
import { getProductType } from '@/lib/tycoon/data/productTypes'
import { REGION_NAME } from '@/lib/tycoon/data/regions'
import { ABSORB_STAFF_BASE, ABSORB_STAFF_MAX, ABSORB_STAFF_PER_REPUTATION, PROJECT_SIZES } from '@/lib/tycoon/sim/balance'
import { absorbSlots, acquisitionBlocker, acquisitionPrice, rivalProductsOf } from '@/lib/tycoon/sim/rivals'
import { revenueForUsers } from '@/lib/tycoon/sim/products'
import { useGame, useStore } from './context'
import { formatCount, formatMoney } from '@/lib/tycoon/format'
import { Modal } from './Modal'

/** Absorbing a rival: its office and people become yours, and you choose which of its products come along. */
export function AbsorbDialog({ rivalId }: { rivalId: number }) {
  const store = useStore()
  const state = useGame()
  const rival = state.rivals.find((r) => r.id === rivalId)
  const [kept, setKept] = useState<number[]>([])
  const [error, setError] = useState('')

  if (!rival) {
    return (
      <Modal title="Gone" onClose={() => store.closeDialog()}>
        <p className="muted">That studio is no longer on the market.</p>
        <div className="actions">
          <button onClick={() => store.closeDialog()}>Close</button>
        </div>
      </Modal>
    )
  }

  const region = rival.region ?? 'us'
  const products = rivalProductsOf(state, rival)
  const slots = absorbSlots(state)
  const blocker = acquisitionBlocker(state, rival)
  const people = Math.min(ABSORB_STAFF_MAX, ABSORB_STAFF_BASE + Math.floor(rival.reputation / ABSORB_STAFF_PER_REPUTATION))
  const toggle = (id: number) => setKept((current) => (current.includes(id) ? current.filter((x) => x !== id) : current.length < slots ? [...current, id] : current))
  const confirm = () => {
    const result = store.acquire(rival.id, kept)
    if (!result.ok) setError(result.reason)
    else store.closeDialog()
  }

  return (
    <Modal title={`Absorb ${rival.name}`} onClose={() => store.closeDialog()}>
      <p className="muted">
        The studio leaves the market. Its {REGION_NAME[region]} office becomes one of yours, in place of one you would have built, with about{' '}
        <strong>{people} people</strong> who know {rival.focus.map((id) => getProductType(id).name.toLowerCase()).join(', ')}. Its other business adds to your income.
      </p>
      <section className="section">
        <div className="section-head">
          <h3>Products to keep</h3>
          <span className="muted">
            {kept.length}/{slots} places free in your portfolio
          </span>
        </div>
        {products.length === 0 && <p className="muted">It has no products on the market.</p>}
        {products.map((p) => (
          <label key={p.id} className={`feature ${kept.includes(p.id) ? 'on' : ''}`}>
            <input type="checkbox" checked={kept.includes(p.id)} disabled={!kept.includes(p.id) && kept.length >= slots} onChange={() => toggle(p.id)} />
            <span className="feature-name">
              {p.name}
              {p.hit ? ' 🚀' : ''}
            </span>
            <span className="tag muted">
              {PROJECT_SIZES[p.size].name} {getProductType(p.productTypeId).name}
            </span>
            <span className="costs">
              {formatCount(p.users)} · {formatMoney(revenueForUsers(p.productTypeId, p.users))}/day
            </span>
          </label>
        ))}
        <p className="muted">The ones you leave behind go with the studio.</p>
      </section>
      <div className="upgrade">
        <span>
          Price <strong>{formatMoney(acquisitionPrice(state, rival))}</strong> <small className="muted">· {Math.round(rival.growth * 100)}% growth a year</small>
        </span>
      </div>
      <div className="actions">
        {blocker && <p className="bad action-note">{blocker}</p>}
        {error && <p className="bad action-note">{error}</p>}
        <button onClick={() => store.closeDialog()}>Cancel</button>
        <button className="primary" disabled={blocker !== null} onClick={confirm}>
          Absorb
        </button>
      </div>
    </Modal>
  )
}
