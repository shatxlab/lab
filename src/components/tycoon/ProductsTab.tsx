import { useState } from 'react'
import { getProductType } from '@/lib/tycoon/data/productTypes'
import { PORTFOLIO_LIMIT, PROJECT_SIZES, SALE_MIN_INCOME, PROMO_MIN_EFFECT, PROMO_RECOVERY_DAYS, PROMOTIONS } from '@/lib/tycoon/sim/balance'
import { inGarage } from '@/lib/tycoon/sim/offices'
import { licenseBlocker, licenseIncome, LICENSING_RESEARCH } from '@/lib/tycoon/sim/licensing'
import { isResearched } from '@/lib/tycoon/sim/unlocks'
import { fixBlocker, fixOf } from '@/lib/tycoon/sim/fixes'
import { salePrice, sunsetBlocker, sunsetOutcome } from '@/lib/tycoon/sim/sunset'
import { autoPromoteUnlocked, growBlocker, promotionEffect, newProductBlocker, nextSize, productPhase, promotionBlocker, promotionCost, updateBlocker } from '@/lib/tycoon/sim/lifecycle'
import { audienceFor } from '@/lib/tycoon/data/audiences'
import { feedbackFor } from '@/lib/tycoon/sim/insight'
import { getFeature } from '@/lib/tycoon/data/features'
import { bugDensity, interest, lastReleaseDay, missingFeatures, productRevenue, targetUsers } from '@/lib/tycoon/sim/products'
import { TIERS, type GameState, type Product, type Tier } from '@/lib/tycoon/sim/types'
import { useGame, useOffice, useStore } from './context'
import { FixPicker, OnCallPanel } from './FixControls'
import { formatAge, formatCount, formatDateShort, formatMoney, TIER_NAME } from '@/lib/tycoon/format'

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
  const [fixing, setFixing] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const type = getProductType(product.productTypeId)
  const blocker = updateBlocker(state, office, product)
  const next = nextSize(product.size)
  const growProblem = next ? growBlocker(state, office, product) : null
  const fixProblem = fixBlocker(state, product)
  const fixingNow = fixOf(state, product.id) !== undefined
  const sunsetProblem = sunsetBlocker(state, product)
  const outcome = sunsetOutcome(product)
  const promoLeft = product.boostUntil - state.day
  const effect = promotionEffect(state, product)
  const updates = product.updates.length
  const bugs = Math.floor(product.bugs)
  const stale = interest(product, state.day) < 1
  const sinceRelease = formatAge(state.day - lastReleaseDay(product))
  const { arrow, tone } = trend(state, product)
  const missing = missingFeatures(product, state.day)
  const audience = audienceFor(product.productTypeId, product.audienceId)
  const feedback = feedbackFor(state, product)

  return (
    <div className="product">
      <div className="product-head">
        <strong>
          {product.name}
          {product.hit && <span title={state.signatureId === product.id ? 'Your signature hit' : 'A hit'}> 🚀</span>}
        </strong>
        <span className="muted">
          {PROJECT_SIZES[product.size].name} {type.name}{audience.name !== 'Everyone' && ` for ${audience.name.toLowerCase()}`} · {productPhase(state, product)} · quality {Math.round(product.quality)}
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
      {audience.name !== 'Everyone' && (feedback.loved.length > 0 || feedback.shrugged.length > 0 || feedback.missed.length > 0 || feedback.waiting) && (
        <div className="product-feedback">
          <small className="muted" title={`What ${audience.name.toLowerCase()} say about ${product.name}`}>
            {feedback.loved.length > 0 && (
              <span className="good">Loved: {feedback.loved.join(', ')}. </span>
            )}
            {feedback.shrugged.length > 0 && <span>Shrugged at: {feedback.shrugged.join(', ')}. </span>}
            {feedback.missed.length > 0 && <span className="warn">Wished for: {feedback.missed.join(', ')}.</span>}
            {feedback.waiting && <span className="muted"> More feedback is still coming in.</span>}
          </small>
        </div>
      )}
      <div className="product-actions">
        <button disabled={blocker !== null} onClick={() => store.openDialog({ kind: 'new-project', updateOf: product.id, officeId: office.id })}>
          Update
        </button>
        {next && (
          <button
            disabled={growProblem !== null}
            title={growProblem ?? `Grow into a ${PROJECT_SIZES[next].name} product`}
            onClick={() => store.openDialog({ kind: 'new-project', updateOf: product.id, officeId: office.id, grow: true })}
          >
            Grow to {PROJECT_SIZES[next].name}…
          </button>
        )}
        <button disabled={fixProblem !== null} aria-expanded={fixing} title={fixProblem ?? undefined} onClick={() => setFixing(!fixing)}>
          Fix bugs…
        </button>
        <button aria-expanded={promoting} onClick={() => setPromoting(!promoting)}>
          Promote…
        </button>
        <button disabled={sunsetProblem !== null} title={sunsetProblem ?? undefined} aria-expanded={confirming} onClick={() => setConfirming(!confirming)}>
          {outcome === 'sold' ? 'Sell…' : 'Retire…'}
        </button>
        {blocker && <small className="muted">{blocker}</small>}
        {!blocker && fixProblem && <small className="muted">{fixProblem}</small>}
      </div>
      {fixing && !fixingNow && <FixPicker product={product} onDone={() => setFixing(false)} />}
      {confirming && (
        <div className="confirm-sunset">
          {outcome === 'sold' ? (
            <small>
              A rival buys {product.name} for <strong>{formatMoney(salePrice(product))}</strong>. The team will miss it
              {product.hit ? ' (a hit: the studio\'s name takes a bigger knock)' : ''}.
            </small>
          ) : (
            <small>
              Switch {product.name} off for good. It earns too little to sell (under {formatMoney(SALE_MIN_INCOME)} a day); nothing is lost beyond the product.
            </small>
          )}
          <button
            className="danger"
            onClick={() => {
              store.sunsetProduct(product.id)
              setConfirming(false)
            }}
          >
            {outcome === 'sold' ? 'Sell it' : 'Retire it'}
          </button>
        </div>
      )}
      {isResearched(state, LICENSING_RESEARCH) && product.size === 'flagship' && (
        <div className="auto-promote muted">
          {product.licensed ? (
            <>
              Licensed: <strong>+{formatMoney(licenseIncome(state, product))}</strong>/day while it is fresh and free of bugs.{' '}
              <button onClick={() => store.setLicensed(product.id, false)}>End the licence</button>
            </>
          ) : (
            <>
              <button disabled={licenseBlocker(state, product) !== null} title={licenseBlocker(state, product) ?? undefined} onClick={() => store.setLicensed(product.id, true)}>
                License to other companies
              </button>{' '}
              <small>{licenseBlocker(state, product) ?? 'A steady fee on top of your own users, for as long as you keep it in shape.'}</small>
            </>
          )}
        </div>
      )}
      {autoPromoteUnlocked(state) && (
        <label className="auto-promote muted">
          Promote automatically:{' '}
          <select
            value={product.autoPromote ?? ''}
            onChange={(e) => store.setAutoPromote(product.id, e.target.value === '' ? null : (e.target.value as Tier))}
          >
            <option value="">Off</option>
            {TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {TIER_NAME[tier]} · {formatMoney(promotionCost(product, tier))}
              </option>
            ))}
          </select>
          <small> when the audience has recovered and the bank keeps two months of costs</small>
        </label>
      )}
      {promoting && (
        <div className="tiers">
          {promoLeft <= 0 && effect < 1 && (
            <small className={effect < 0.5 ? 'bad' : 'warn'}>
              People are tired of the ads: a promotion now brings {Math.round(effect * 100)}% of its users. Full effect in{' '}
              {Math.ceil((1 - effect) / (1 - PROMO_MIN_EFFECT) * PROMO_RECOVERY_DAYS)} days.
            </small>
          )}
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
                    {reason ?? `+${formatCount(product.reach * PROMOTIONS[tier].users * effect)} ${type.userNoun} over ${PROMOTIONS[tier].days} days`}
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
      {!inGarage(state) && (
        <p className="muted">
          Portfolio {products.length}/{PORTFOLIO_LIMIT}
          {newProductBlocker(state) && ` · ${newProductBlocker(state)}`}
        </p>
      )}
      <OnCallPanel />
      {products.map((p) => (
        <ProductRow key={p.id} product={p} />
      ))}
    </div>
  )
}
