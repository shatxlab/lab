import { useState } from 'react'
import { PROMOTIONS } from '@/lib/tycoon/sim/balance'
import { autoPromoteUnlocked, promotionAudience, promotionBlocker, promotionCost, promotionEffect, promotionReturn } from '@/lib/tycoon/sim/lifecycle'
import { licenseBlocker, licenseIncome } from '@/lib/tycoon/sim/licensing'
import { salePrice, sunsetBlocker, sunsetOutcome } from '@/lib/tycoon/sim/sunset'
import { TIERS, type Product, type Result, type Tier } from '@/lib/tycoon/sim/types'
import { formatCount, formatMoney, TIER_NAME } from '@/lib/tycoon/format'
import { useGame, useStore } from './context'

/** Cash/policy decisions don't pretend to consume delivery capacity. Builds live in AssignmentEditor. */
export function ProductOperations({ product }: { product: Product }) {
  const state = useGame()
  const store = useStore()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const apply = (result: Result) => setError(result.ok ? '' : result.reason)
  const sunset = sunsetBlocker(state, product)
  const outcome = sunsetOutcome(product)
  const effect = promotionEffect(state, product)
  return <details className="plan" aria-label="Product commercial controls">
    <summary>Commercial decisions · {product.name}</summary>
    <div className="product-commercial-body">
    <p>These spend company cash or change policy, not team capacity. Payroll, rent and hosting continue. For updates, bug fixes, expansion and Europe, assign work above.</p>
    <strong>Paid promotion</strong>
    <p>Audience recovery: {Math.round(effect * 100)}%. Paid users arrive over time; returns depend on keeping the product healthy, not a guaranteed profit.</p>
    <div className="tiers">{TIERS.map((tier) => {
      const blocker = promotionBlocker(state, product, tier)
      return <div key={tier}>
        <button disabled={!!blocker} onClick={() => apply(store.promote(product.id, tier))}>{TIER_NAME[tier]} · {formatMoney(promotionCost(state, product, tier))}</button>
        <small>{blocker ?? `About ${formatCount(promotionAudience(state, product) * PROMOTIONS[tier].users * effect)} users over ${PROMOTIONS[tier].days} days; estimated ${promotionReturn(state, product, tier).toFixed(1)}× gross payback if fresh.`}</small>
      </div>
    })}</div>
    {autoPromoteUnlocked(state) && <label>Automatic promotion
      <select value={product.autoPromote ?? ''} onChange={(e) => apply(store.setAutoPromote(product.id, e.target.value === '' ? null : e.target.value as Tier))}>
        <option value="">Off</option>{TIERS.map((tier) => <option key={tier} value={tier}>{TIER_NAME[tier]} · {formatMoney(promotionCost(state, product, tier))}</option>)}
      </select>
      <small>Waits for audience recovery and preserves two months of operating costs.</small>
    </label>}
    <strong>Licensing</strong>
    {product.licensed ? <p>Current licence: +{formatMoney(licenseIncome(state, product))}/day while healthy. <button onClick={() => apply(store.setLicensed(product.id, false))}>End the licence</button></p>
      : <><button disabled={!!licenseBlocker(state, product)} onClick={() => apply(store.setLicensed(product.id, true))}>License to other companies</button><small>{licenseBlocker(state, product) ?? 'A continuing fee tied to product revenue, freshness and bugs.'}</small></>}
    <strong>{outcome === 'sold' ? 'Sell product' : 'Retire product'}</strong>
    <button disabled={!!sunset} onClick={() => { setConfirming(true); setError('') }}>{outcome === 'sold' ? 'Sell product…' : 'Retire product…'}</button>
    {sunset && <small className="warn">{sunset}</small>}
    {confirming && <div role="group" aria-label="Confirm product sunset">
      <p>{outcome === 'sold' ? `A rival buys ${product.name} for ${formatMoney(salePrice(product))}. The team loses morale and the studio loses reputation, especially for a hit.` : `Switch ${product.name} off permanently, with no sale proceeds.`} Its users, revenue and ecosystem bonuses end; any standing coverage assigned directly to it becomes idle. This does not sell the company or end its chapter.</p>
      <button className="danger" disabled={!!sunset} onClick={() => { const result = store.sunsetProduct(product.id); apply(result); if (result.ok) setConfirming(false) }}>{outcome === 'sold' ? 'Confirm product sale' : 'Confirm retirement'}</button>{' '}
      <button onClick={() => setConfirming(false)}>Cancel</button>
    </div>}
    {error && <p role="alert" className="warn">{error}</p>}
    </div>
  </details>
}
