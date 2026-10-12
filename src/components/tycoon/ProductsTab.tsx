import { useState } from 'react'
import { getProductType } from '@/lib/tycoon/data/productTypes'
import { PROJECT_SIZES, PROMOTIONS } from '@/lib/tycoon/sim/balance'
import { fixBlocker, fixTarget } from '@/lib/tycoon/sim/fixes'
import { promotionBlocker, promotionCost, updateBlocker } from '@/lib/tycoon/sim/lifecycle'
import { getFeature } from '@/lib/tycoon/data/features'
import { bugDensity, interest, lastReleaseDay, missingFeatures, productRevenue, targetUsers } from '@/lib/tycoon/sim/products'
import { TIERS, type GameState, type Product } from '@/lib/tycoon/sim/types'
import { estimateDays } from '@/lib/tycoon/sim/work'
import { useGame, useOffice, useStore } from './context'
import { formatAge, formatCount, formatDateShort, formatDays, formatMoney, TIER_NAME } from '@/lib/tycoon/format'

/** Bugs per unit of work above which the count shows in red: users are noticeably leaving. */
const BUGGY = 10

/** "↑" while users are still arriving, "↓" while they are leaving, nothing when settled. */
function trend(state: GameState, product: Product): { arrow: string; tone: string } {
  const target = targetUsers(state, product)
  if (target > product.users * 1.02) return { arrow: '↑', tone: 'good' }
  if (target < product.users * 0.98) return { arrow: '↓', tone: 'bad' }
  return { arrow: '', tone: '' }
}

function ProductRow({ product }: { product: Product }) {
  const store = useStore()
  const state = useGame()
  // Updates and fixes go to the office on screen.
  const office = useOffice()
  const [promoting, setPromoting] = useState(false)

  const type = getProductType(product.productTypeId)
  const blocker = updateBlocker(state, office, product)
  const fixProblem = fixBlocker(state, office, product)
  const fixDays = estimateDays(state, fixTarget(Math.floor(product.bugs)), office)
  const promoLeft = product.boostUntil - state.day
  const updates = product.updates.length
  const bugs = Math.floor(product.bugs)
  const stale = interest(product, state.day) < 1
  const sinceRelease = formatAge(state.day - lastReleaseDay(product))
  const { arrow, tone } = trend(state, product)
  const missing = missingFeatures(product, state.day)

  return (
    <div className="product">
      <div className="product-head">
        <strong>
          {product.name}
          {product.hit && <span title={state.signatureId === product.id ? 'Your signature hit' : 'A hit'}> 🚀</span>}
        </strong>
        <span className="muted">
          {PROJECT_SIZES[product.size].name} {type.name} · quality {Math.round(product.quality)}
          {updates > 0 && ` · ${updates} update${updates === 1 ? '' : 's'}`}
        </span>
      </div>
      <div className="product-stats">
        <span>
          <strong>{formatCount(product.users)}</strong> {type.userNoun}
          {arrow && <span className={tone}> {arrow}</span>} · <strong>{formatMoney(productRevenue(product))}</strong>/day
          {promoLeft > 0 && (
            <span className="good">
              {' '}
              (promoted, {promoLeft}d left)
            </span>
          )}
        </span>
        <span className="muted">
          Total {formatMoney(product.totalRevenue)} · released {formatDateShort(product.releaseDay)}
        </span>
      </div>
      <div className="product-health">
        <span className={bugDensity(product) >= BUGGY ? 'bad' : 'muted'}>
          🐞 {bugs} bug{bugs === 1 ? '' : 's'}
        </span>
        <span className={stale ? 'bad' : 'muted'}>
          {stale ? `Stale: ${type.userNoun} drifting away, last update ${sinceRelease} ago` : `Fresh: last update ${sinceRelease} ago`}
        </span>
        {missing.length > 0 && (
          <span className="bad" title="Users in this era take these for granted. An update that adds them wins those users back.">
            Expected now: {missing.map((id) => getFeature(id).name).join(', ')}
          </span>
        )}
      </div>
      <div className="product-actions">
        <button disabled={blocker !== null} onClick={() => store.openDialog({ kind: 'new-project', updateOf: product.id, officeId: office.id })}>
          Update
        </button>
        <button
          disabled={fixProblem !== null}
          title={fixProblem ?? undefined}
          onClick={() => store.startFix(product.id, office.id)}
        >
          Fix bugs{fixProblem === null && <small> · {formatDays(fixDays)}</small>}
        </button>
        <button aria-expanded={promoting} onClick={() => setPromoting(!promoting)}>
          Promote…
        </button>
        {blocker && <small className="muted">{blocker}</small>}
      </div>
      {promoting && (
        <div className="tiers">
          {promoLeft > 0 ? (
            <small className="muted">Already promoted for {promoLeft} more day{promoLeft === 1 ? '' : 's'}.</small>
          ) : (
            TIERS.map((tier) => {
              const reason = promotionBlocker(state, product, tier)
              return (
                <button key={tier} disabled={reason !== null} onClick={() => store.promote(product.id, tier)}>
                  <span>
                    <strong>{TIER_NAME[tier]}</strong> {formatMoney(promotionCost(product, tier))}
                  </span>
                  <small className={reason ? 'bad' : 'muted'}>
                    {reason ?? `+${formatCount(product.reach * PROMOTIONS[tier].users)} ${type.userNoun} over ${PROMOTIONS[tier].days} days`}
                  </small>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

/** Live products, the biggest earners first. */
export function ProductsTab() {
  const state = useGame()
  const products = [...state.products].sort((a, b) => productRevenue(b) - productRevenue(a) || b.id - a.id)

  if (products.length === 0) return <p className="muted">Nothing shipped yet.</p>
  return (
    <div className="products">
      {products.map((p) => (
        <ProductRow key={p.id} product={p} />
      ))}
    </div>
  )
}
