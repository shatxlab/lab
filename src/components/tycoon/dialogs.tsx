import { downloadJournal, startNewGame } from '@/lib/tycoon/browser'
import { getProductType } from '@/lib/tycoon/data/productTypes'
import { ERAS } from '@/lib/tycoon/data/eras'
import { getFeature } from '@/lib/tycoon/data/features'
import { getStage } from '@/lib/tycoon/data/stages'
import { ERA_WAGE_GROWTH, HIT_REACH } from '@/lib/tycoon/sim/balance'
import { offerWindowLeft } from '@/lib/tycoon/sim/exit'
import { longestServing, runSummary } from '@/lib/tycoon/sim/journal'
import { officeName } from '@/lib/tycoon/sim/offices'
import { missingFeatures } from '@/lib/tycoon/sim/products'
import { projectQuality } from '@/lib/tycoon/sim/project'
import { useGame, useOffice, useStore } from './context'
import { formatCount, formatDate, formatMoney, qualityLabel } from '@/lib/tycoon/format'
import { you as founderAnalyst } from '@/lib/tycoon/sim/founding'
import { Modal } from './Modal'

export function ReadyDialog({ officeId }: { officeId: number }) {
  const store = useStore()
  const state = useGame()
  const office = useOffice(officeId)
  const project = office.project
  if (!project) return null
  const quality = Math.round(projectQuality(state, project))

  return (
    <Modal title="Ready to ship" onClose={() => store.closeDialog()}>
      <p>
        {state.offices.length > 1 && <span className="muted">{officeName(state, office)}: </span>}
        <strong>{project.name}</strong> has hit its target in all three disciplines. Quality right now is{' '}
        <strong>{quality}</strong> ({qualityLabel(quality)}).
      </p>
      <p className="muted">
        You can keep polishing for extra quality, up to 150% on each bar, but the team's wages keep running.
      </p>
      <div className="actions">
        <button onClick={() => store.closeDialog()}>Keep polishing</button>
        <button
          className="primary"
          onClick={() => {
            store.selectOffice(office.id)
            store.openDialog({ kind: 'ship', officeId: office.id })
          }}
        >
          {project.kind === 'update' ? 'Release it' : 'Ship it'}
        </button>
      </div>
    </Modal>
  )
}

interface ResultDialogProps {
  productId: number
  reputationDelta: number
  early: boolean
  unlocked: string[]
  update: boolean
  reach: number
  bugs: number
  quality: number
}

export function ResultDialog({ productId, reputationDelta, early, unlocked, update, reach, bugs, quality }: ResultDialogProps) {
  const store = useStore()
  const state = useGame()
  const product = state.products.find((p) => p.id === productId)
  if (!product) return null
  const sign = reputationDelta >= 0 ? '+' : '-'
  const noun = getProductType(product.productTypeId).userNoun
  const bugCount = Math.round(bugs)

  return (
    <Modal title={update ? 'Updated' : 'Released'} onClose={() => store.closeDialog()}>
      <p>
        <strong>{product.name}</strong> <span className="muted">({getProductType(product.productTypeId).name})</span>{' '}
        {update ? 'has a new update out.' : 'is out.'}
      </p>
      <div className="result-grid">
        <div className="stat">
          <span className="label">Quality</span>
          <span className="value">{Math.round(quality)}</span>
          <span className="sub">{qualityLabel(quality)}</span>
        </div>
        <div className="stat">
          <span className="label">Can reach</span>
          <span className="value good">{formatCount(reach)}</span>
          <span className="sub">{update ? `${noun}, interested again` : `${noun}, signing up over the coming weeks`}</span>
        </div>
        <div className="stat">
          <span className="label">Reputation</span>
          <span className={`value ${reputationDelta >= 0 ? 'good' : 'bad'}`}>
            {sign}
            {Math.abs(reputationDelta).toFixed(1)}
          </span>
        </div>
      </div>
      <p className="muted">
        {update ? 'The update' : 'It'} shipped with {bugCount} bug{bugCount === 1 ? '' : 's'}. Users find more over time; a bug-fixing
        sprint keeps them from driving {noun} away.
      </p>
      {early && <p className="muted">Shipped before every bar hit its target, which lowers quality.</p>}
      {product.hit && !update && (
        <p className="unlock">🚀 It is breaking out: it can reach {HIT_REACH[product.size]}× as many {noun} as planned.</p>
      )}
      {unlocked.length > 0 && (
        <p className="unlock">
          Unlocked: <strong>{unlocked.join(', ')}</strong>
        </p>
      )}
      <div className="actions">
        <button onClick={() => store.closeDialog()}>Close</button>
        <button className="primary" onClick={() => store.openDialog({ kind: 'new-project' })}>
          Next project
        </button>
      </div>
    </Modal>
  )
}

/** How the run ended: bankrupt, sold from the garage, or retired. The same numbers for each, so runs can be compared. */
export function GameOverDialog() {
  const state = useGame()
  const ending = state.ending
  const sold = ending?.kind === 'sold'
  const retired = ending?.kind === 'retired'
  const summary = runSummary(state)
  const years = Number(summary.years)
  const serving = longestServing(state)
  return (
    <Modal title={sold ? 'Sold' : retired ? 'Your legacy' : 'Bankrupt'}>
      {sold ? (
        <p>
          <strong>{ending?.bidder}</strong> bought the studio for <strong>{formatMoney(ending?.price ?? 0)}</strong>. {formatDate(state.day)}.
        </p>
      ) : retired ? (
        <p>You hand the company on. {formatDate(state.day)}.</p>
      ) : (
        <p>The money ran out and stayed out. {formatDate(state.day)}.</p>
      )}
      <div className="result-grid">
        {ending && ending.kind !== 'bankrupt' && (
          <div className="stat">
            <span className="label">{sold ? 'Final worth' : 'Worth'}</span>
            <span className="value">{formatMoney(ending.worth)}</span>
          </div>
        )}
        <div className="stat">
          <span className="label">Years</span>
          <span className="value">{years.toFixed(1)}</span>
        </div>
        <div className="stat">
          <span className="label">Best day</span>
          <span className="value">{formatMoney(Number(summary.peakIncome))}</span>
        </div>
        <div className="stat">
          <span className="label">Total revenue</span>
          <span className="value">{formatMoney(state.lifetimeRevenue)}</span>
        </div>
        <div className="stat">
          <span className="label">Products shipped</span>
          <span className="value">{state.shippedCount}</span>
        </div>
        <div className="stat">
          <span className="label">Hits</span>
          <span className="value">{String(summary.hits)}</span>
        </div>
        <div className="stat">
          <span className="label">Reputation</span>
          <span className="value">{Math.round(state.reputation)}</span>
        </div>
        {sold && (
          <div className="stat">
            <span className="label">Offers turned down</span>
            <span className="value">{state.exit.declined}</span>
          </div>
        )}
      </div>
      {serving.length > 0 && (
        <p className="muted">
          Longest with you: {serving.join(', ')}.
        </p>
      )}
      <div className="actions">
        <button onClick={() => downloadJournal(state)}>Export run log</button>
        <button className="primary" onClick={startNewGame}>
          New game
        </button>
      </div>
    </Modal>
  )
}

/** A bigger company wants the studio. Only the garage can be sold: moving out closes this for good. */
export function OfferDialog() {
  const store = useStore()
  const state = useGame()
  const offer = state.exit.pending
  if (!offer) return null
  return (
    <Modal title="An offer for the studio">
      <p>
        <strong>{offer.bidder}</strong> wants to buy the studio for <strong>{formatMoney(offer.price)}</strong>.
      </p>
      <p className="muted">
        Selling ends the run. If you say no, they will come back with a slightly better offer
        {state.exit.declined > 0 ? ` (you have turned down ${state.exit.declined})` : ''}, but only for about {offerWindowLeft(state) ?? 0} more days: then buyers move on. Moving into a rented floor is fine; once the studio takes a second floor (or opens in Europe) it is a building, and nobody will buy it any more.
      </p>
      <div className="actions">
        <button onClick={() => store.declineBuyout()}>Not yet</button>
        <button className="primary" onClick={() => store.acceptBuyout()}>
          Sell for {formatMoney(offer.price)}
        </button>
      </div>
    </Modal>
  )
}

/** A launch took off: the moment the studio's story turns. */
export function BreakoutDialog({ productId }: { productId: number }) {
  const store = useStore()
  const state = useGame()
  const product = state.products.find((p) => p.id === productId)
  if (!product) return null
  const signature = state.signatureId === product.id
  const you = founderAnalyst(state)
  const noun = getProductType(product.productTypeId).userNoun

  return (
    <Modal title="🚀 It's taking off!" onClose={() => store.closeDialog()}>
      <p>
        <strong>{product.name}</strong> has caught on far beyond anything you planned. Word is spreading, and it can now
        reach about <strong>{formatCount(product.reach)}</strong> {noun}.
      </p>
      {signature ? (
        <>
          <p>
            It is your first hit, and from now on it is what people know the studio for. Keep it fresh and keep its bugs down:
            a hit draws far more {noun}, and they find far more bugs.
          </p>
          {you && you.role === 'pm' && (
            <p>
              <strong>{you.name}</strong>, you steer it from here as its product manager.
            </p>
          )}
        </>
      ) : (
        <p className="muted">Another hit. Look after it like the first one.</p>
      )}
      <div className="actions">
        <button className="primary" onClick={() => store.closeDialog()}>
          Brilliant
        </button>
      </div>
    </Modal>
  )
}

/** The studio has moved on to a new chapter of its journey. */
export function StageDialog({ stage }: { stage: number }) {
  const store = useStore()
  const reached = getStage(stage)

  return (
    <Modal title={`New chapter: ${reached.name}`} onClose={() => store.closeDialog()}>
      <p>{reached.blurb}</p>
      {reached.unlocks.length > 0 && (
        <div className="unlock">
          Now open to you:
          <ul>
            {reached.unlocks.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
        </div>
      )}
      {reached.goals.length > 0 && (
        <p className="muted">
          Next: {reached.goals.map((g) => g.label.toLowerCase()).join('; ')}. The Studio's Journey tab tracks it.
        </p>
      )}
      <div className="actions">
        <button
          onClick={() => {
            store.closeDialog()
            store.openDialog({ kind: 'studio', tab: 'journey' })
          }}
        >
          See the journey
        </button>
        <button className="primary" onClick={() => store.closeDialog()}>
          Onwards
        </button>
      </div>
    </Modal>
  )
}

/** A new era: what the market wants now, and which of your products have fallen behind. */
export function EraDialog({ era }: { era: number }) {
  const store = useStore()
  const state = useGame()
  const next = ERAS[era]
  const behind = state.products
    .map((p) => ({ product: p, missing: missingFeatures(p, state.day) }))
    .filter((row) => row.missing.length > 0 && row.product.users >= 100)

  return (
    <Modal title={`A new era: ${next.name}`} onClose={() => store.closeDialog()}>
      <p>{next.blurb}</p>
      <p className="muted">
        Market wages rise {Math.round(ERA_WAGE_GROWTH * 100)}% with the era, so new hires and monthly raises cost more from now on.
      </p>
      {behind.length > 0 && (
        <div className="unlock">
          These products now lack what users expect, and will lose some of them until an update adds it:
          <ul>
            {behind.map(({ product, missing }) => (
              <li key={product.id}>
                <strong>{product.name}</strong>: {missing.map((id) => getFeature(id).name).join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="actions">
        <button
          onClick={() => {
            store.closeDialog()
            store.openDialog({ kind: 'studio', tab: 'industry' })
          }}
        >
          See the markets
        </button>
        <button className="primary" onClick={() => store.closeDialog()}>
          Got it
        </button>
      </div>
    </Modal>
  )
}
