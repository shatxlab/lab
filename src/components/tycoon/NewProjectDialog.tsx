import { useMemo, useState } from 'react'
import { audiencesOf } from '@/lib/tycoon/data/audiences'
import { FEATURES } from '@/lib/tycoon/data/features'
import { getProductType, PRODUCT_TYPES } from '@/lib/tycoon/data/productTypes'
import { CONTRACT_DEPOSIT, DAYS_PER_MONTH, SURVEY_COST, GROW_MAX_FEATURES, MARKET_COLD, MARKET_HOT, MAX_FEATURES, PROJECT_SIZES, UPDATE_MAX_FEATURES, WORK_SCALE } from '@/lib/tycoon/sim/balance'
import { eraAt, expectedFeatures } from '@/lib/tycoon/data/eras'
import { contractBlocker } from '@/lib/tycoon/sim/contracts'
import { newProductBlocker, nextSize } from '@/lib/tycoon/sim/lifecycle'
import { monthlyBurn } from '@/lib/tycoon/sim/economy'
import { marketDemand } from '@/lib/tycoon/sim/market'
import { officeName, teamOf } from '@/lib/tycoon/sim/offices'
import { marketWeights } from '@/lib/tycoon/sim/products'
import { budgetBlocker, estimateUpdateReach, growTarget, projectBudget, projectTarget, unlockedProductTypes } from '@/lib/tycoon/sim/project'
import { featureLock, productTypeLock, sizeLock } from '@/lib/tycoon/sim/unlocks'
import { DISCIPLINES, PROJECT_SIZE_IDS, type ContractOffer, type Office, type ProjectSize } from '@/lib/tycoon/sim/types'
import { estimateDays } from '@/lib/tycoon/sim/work'
import { DISCIPLINE_COLORS, DISCIPLINE_LABELS } from '@/lib/tycoon/theme'
import { useGame, useOffice, useStore } from './context'
import { formatCount, formatDays, formatDemand, formatMoney } from '@/lib/tycoon/format'
import { crowdLabel } from './IndustryTab'
import { hasAnalyst, isSurveyed, surveyBlocker } from '@/lib/tycoon/sim/insight'
import { pmEffectText } from '@/lib/tycoon/sim/direction'
import { audienceLikes, LOVED_AT, SHRUGGED_AT } from '@/lib/tycoon/sim/scoring'
import { Modal } from './Modal'
import { cssVars } from './style'

/** What a studied audience thinks of a feature: loved, fine, or barely noticed (which adds little but does no harm). */
function TasteTag({ likes }: { likes: number }) {
  if (likes >= LOVED_AT) return <span className="tag taste good" title="They love it: more users, and a better chance of a hit">♥ loved</span>
  if (likes <= SHRUGGED_AT) return <span className="tag taste muted" title="They barely notice it: it adds little, but does no harm">meh</span>
  return <span className="tag taste muted" title="They like it well enough">fine</span>
}

/** Colours the demand label: green when hot, red when cold. */
function marketTone(demand: number): string {
  return demand >= MARKET_HOT ? 'good' : demand <= MARKET_COLD ? 'bad' : 'muted'
}

/** The jobs clients are offering, each with how long this office's team would take. */
function ClientWork({ office }: { office: Office }) {
  const store = useStore()
  const state = useGame()
  const [error, setError] = useState<{ offerId: number; reason: string } | null>(null)
  const blocker = contractBlocker(state, office)
  const take = (offer: ContractOffer) => {
    const result = store.acceptContract(offer.id, office.id)
    setError(result.ok ? null : { offerId: offer.id, reason: result.reason })
  }

  return (
    <>
      <p className="muted">
        Steady money, no users: the client advances half when you take the job and pays the rest when it is done (the second half is lost if you are late). New jobs turn up every week or two and go elsewhere after a few weeks.
      </p>
      {state.contracts.length === 0 && <p className="muted">No one is offering work right now.</p>}
      <div className="contracts">
        {state.contracts.map((offer) => {
          const days = estimateDays(state, offer.target, office)
          const tight = days > offer.days
          return (
            <div key={offer.id} className="contract-offer">
              <div>
                {offer.productId !== undefined && <span className="tag good" title="A big client wants one of your products customised. Delivering it counts as a release of that product.">enterprise</span>}{' '}
                <strong>
                  {offer.title[0].toUpperCase()}
                  {offer.title.slice(1)}
                </strong>{' '}
                <span className="muted">for {offer.client}</span>
                <div className="costs">
                  {DISCIPLINES.map((d) => (
                    <span key={d} style={{ color: DISCIPLINE_COLORS[d] }}>
                      {DISCIPLINE_LABELS[d].slice(0, 3)} {offer.target[d]}
                    </span>
                  ))}
                </div>
                <small className={tight ? 'bad' : 'muted'}>
                  Due in {offer.days} days · about {formatDays(days)} with this team
                  {offer.expiresDay !== undefined && ` · on offer for ${Math.max(0, offer.expiresDay - state.day)} more days`}
                </small>
              </div>
              <button className="primary" disabled={blocker !== null} title={blocker ?? undefined} onClick={() => take(offer)}>
                Take it · {formatMoney(offer.pay)}
                <small> · {formatMoney(Math.round(offer.pay * CONTRACT_DEPOSIT))} now</small>
              </button>
              {error?.offerId === offer.id && <p className="bad action-note">{error.reason}</p>}
            </div>
          )
        })}
      </div>
      {blocker && <p className="muted">{blocker}</p>}
    </>
  )
}

/** Plans a new product (or client work) for an office, or (with `updateOf`) an update to a live product. */
export function NewProjectDialog({ updateOf, officeId, grow = false }: { updateOf?: number; officeId?: number; grow?: boolean }) {
  const store = useStore()
  const state = useGame()
  const office = useOffice(officeId)
  const [mode, setMode] = useState<'product' | 'client'>('product')
  const product = updateOf === undefined ? undefined : state.products.find((p) => p.id === updateOf)
  const isUpdate = product !== undefined
  const growsTo = isUpdate && grow ? nextSize(product.size) : null
  const maxFeatures = growsTo ? GROW_MAX_FEATURES : isUpdate ? UPDATE_MAX_FEATURES : MAX_FEATURES
  const portfolioProblem = isUpdate ? null : newProductBlocker(state)

  const unlocked = unlockedProductTypes(state)
  const [typeId, setTypeId] = useState(product?.productTypeId ?? unlocked[unlocked.length - 1].id)
  // The biggest size the office allows: growing into bigger projects is the point of a bigger office.
  const [size, setSize] = useState<ProjectSize>(() => PROJECT_SIZE_IDS.filter((s) => sizeLock(state, s, office) === null).at(-1) ?? 'small')
  const [selected, setSelected] = useState<string[]>([])
  const [audienceId, setAudienceId] = useState(() => audiencesOf(typeId)[0]?.id)
  const [error, setError] = useState('')

  /** Whose tastes the feature list shows, once studied: the product's own audience for an update. */
  const tasteAudience = product ? product.audienceId : audienceId
  const type = getProductType(typeId)
  const expected = expectedFeatures(typeId, state.day)
  const weights = marketWeights(state)
  /** Once the audience is studied the list leads with what they love; until then, with what suits the type best. */
  const studied = isSurveyed(state, tasteAudience)
  const features = useMemo(
    () =>
      FEATURES.filter((f) => !product?.featureIds.includes(f.id)).sort((a, b) => {
        const open = Number(featureLock(state, b) === null) - Number(featureLock(state, a) === null)
        const wanted = Number(expected.includes(b.id)) - Number(expected.includes(a.id))
        const fit = Number(b.suits.includes(typeId)) - Number(a.suits.includes(typeId))
        const liked = studied ? audienceLikes(typeId, tasteAudience, b.id) - audienceLikes(typeId, tasteAudience, a.id) : 0
        return open || wanted || fit || liked || b.value - a.value || a.name.localeCompare(b.name)
      }),
    [typeId, state.research.done.length, product?.id, expected.length, studied, tasteAudience],
  )
  const tasteName = audiencesOf(typeId).find((a) => a.id === tasteAudience)?.name.toLowerCase()
  const projectSize = product?.size ?? size
  const spec = PROJECT_SIZES[projectSize]
  const target = growsTo ? growTarget(typeId, selected, projectSize, growsTo) : projectTarget(typeId, selected, isUpdate ? 'update' : 'new', projectSize)
  const days = estimateDays(state, target, office, { typeId, productId: product?.id ?? null })
  // This office's share of the wages; rent is the studio's either way.
  const officeWages = teamOf(state, office).reduce((sum, e) => sum + e.salary, 0)
  const cost = (days * (officeWages || monthlyBurn(state))) / DAYS_PER_MONTH
  // Starting a product, or growing one, costs a budget on top of the wages; updates are free.
  const budget = isUpdate && !growsTo ? 0 : projectBudget(target)
  const budgetProblem = budgetBlocker(state, budget)
  const full = selected.length >= maxFeatures
  const reach = product ? estimateUpdateReach(state, product.id, selected, growsTo !== null) : 0
  /** What each feature adds to this project's bars. */
  const featureScale = WORK_SCALE * spec.work

  const chooseType = (id: string) => {
    setTypeId(id)
    setAudienceId(audiencesOf(id)[0]?.id)
    setSelected([])
    setError('')
  }
  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : current.length < maxFeatures ? [...current, id] : current,
    )
  const start = () => {
    const result = product ? store.startUpdate(product.id, selected, office.id, growsTo !== null) : store.startProject(typeId, selected, size, office.id, audienceId)
    if (!result.ok) setError(result.reason)
  }

  if (updateOf !== undefined && !product) return null

  const title = growsTo ? `Grow ${product?.name} into a ${PROJECT_SIZES[growsTo].name} product` : product ? `Update ${product.name}` : state.offices.length > 1 ? `New project · ${officeName(state, office)}` : 'New project'
  return (
    <Modal title={title} onClose={() => store.closeDialog()}>
      {!isUpdate && (
        <div className="segmented" role="group" aria-label="Kind of work">
          <button className={mode === 'product' ? 'active' : ''} aria-pressed={mode === 'product'} onClick={() => setMode('product')}>
            Your own product
          </button>
          <button className={mode === 'client' ? 'active' : ''} aria-pressed={mode === 'client'} onClick={() => setMode('client')}>
            Client work{state.contracts.length > 0 && <small> · {state.contracts.length}</small>}
          </button>
        </div>
      )}
      {mode === 'client' && !isUpdate ? (
        <>
          <ClientWork office={office} />
          <div className="actions">
            <button onClick={() => store.closeDialog()}>Cancel</button>
          </div>
        </>
      ) : (
        <>
        {product && (
          <p className="muted">
            {growsTo ? (
              <>
                Growing turns {product.name} into a {PROJECT_SIZES[growsTo].name} product: it can reach {(PROJECT_SIZES[growsTo].reach / PROJECT_SIZES[product.size].reach).toFixed(1)}× as many {type.userNoun} and they stay interested longer. It costs what the extra scale adds, and you can build up to {GROW_MAX_FEATURES} features into it.
              </>
            ) : null}
            {!growsTo && <>An update is a smaller project that brings {product.name}'s {type.userNoun} back to full interest, and its new
            features let it reach more people. It ships a few new bugs of its own. With no features chosen it is a
            maintenance release: cheaper, and it keeps the product fresh without growing it.</>}
          </p>
        )}
        {!isUpdate && (
          <div className="chips" role="radiogroup" aria-label="Product type">
            {PRODUCT_TYPES.map((t) => {
              const lock = productTypeLock(state, t)
              const locked = lock !== null
              return (
                <button
                  key={t.id}
                  role="radio"
                  aria-checked={t.id === typeId}
                  className={`chip ${t.id === typeId ? 'active' : ''}`}
                  disabled={locked}
                  onClick={() => chooseType(t.id)}
                >
                  {t.name}
                  {locked ? (
                    <small>{lock}</small>
                  ) : (
                    <small title="Demand when you launch (it drifts over time), and how crowded the market is">
                      <span className={marketTone(marketDemand(state, t.id))}>{formatDemand(marketDemand(state, t.id))}</span>
                      {' · '}
                      <span className={crowdLabel(weights.get(t.id) ?? 0).tone}>{crowdLabel(weights.get(t.id) ?? 0).text}</span>
                    </small>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {!isUpdate && audienceId !== undefined && (
          <>
            <div className="chips" role="radiogroup" aria-label="Audience">
              {audiencesOf(typeId).map((a) => (
                <button key={a.id} role="radio" aria-checked={a.id === audienceId} className={`chip ${a.id === audienceId ? 'active' : ''}`} onClick={() => setAudienceId(a.id)}>
                  {a.name}
                  <small>{a.reach > 1.1 ? 'Wide' : a.reach < 0.9 ? 'Narrow' : 'Mid-size'} · {a.pay > 1.1 ? 'pays well' : a.pay < 0.9 ? 'pays little' : 'pays fairly'}</small>
                </button>
              ))}
            </div>
            <p className="muted">
              {audiencesOf(typeId).find((a) => a.id === audienceId)?.blurb}{' '}
              {isSurveyed(state, audienceId) ? 'You have studied them: what they think of each feature is shown below.' : 'Their favourite features show in feedback after launch.'}
            </p>
            {!isSurveyed(state, audienceId) && (hasAnalyst(state) || state.insight > 0) && (
              <div className="upgrade">
                <span>
                  Study this audience first: {SURVEY_COST} insight <small className="muted">(you have {Math.floor(state.insight)})</small>
                </span>
                <button disabled={surveyBlocker(state, audienceId) !== null} title={surveyBlocker(state, audienceId) ?? undefined} onClick={() => store.survey(audienceId)}>
                  Study
                </button>
              </div>
            )}
          </>
        )}

        {!isUpdate && (
          <div className="chips" role="radiogroup" aria-label="Project size">
            {PROJECT_SIZE_IDS.map((s) => {
              const lock = sizeLock(state, s, office)
              return (
                <button
                  key={s}
                  role="radio"
                  aria-checked={s === size}
                  className={`chip ${s === size ? 'active' : ''}`}
                  disabled={lock !== null}
                  onClick={() => setSize(s)}
                >
                  {PROJECT_SIZES[s].name}
                  <small>{lock ? `Needs ${lock}` : `${PROJECT_SIZES[s].work}× work`}</small>
                </button>
              )
            })}
          </div>
        )}

        <div className="features-head">
          <span>
            Features ({selected.length}/{maxFeatures})
            <small className="muted">
              {' '}
              · {studied ? `${tasteName} love the ones at the top` : tasteName ? `by fit and value; study ${tasteName} to see what they love` : 'by fit and value'}
            </small>
          </span>
          <span className="cost-legend muted">
            cost:{' '}
            {DISCIPLINES.map((d) => (
              <span key={d} style={{ color: DISCIPLINE_COLORS[d] }}>
                {DISCIPLINE_LABELS[d].slice(0, 3)}{' '}
              </span>
            ))}
          </span>
        </div>
        <div className="features">
          {features.map((f) => {
            const on = selected.includes(f.id)
            const fits = f.suits.includes(typeId)
            const lock = featureLock(state, f)
            return (
              <label key={f.id} className={`feature ${on ? 'on' : ''} ${lock ? 'locked' : ''}`}>
                <input type="checkbox" checked={on} disabled={lock !== null || (!on && full)} onChange={() => toggle(f.id)} />
                <span className="feature-name">{f.name}</span>
                <span className="feature-tags">
                  {lock ? (
                    <span className="tag muted">{lock}</span>
                  ) : expected.includes(f.id) ? (
                    <span className="tag warn" title={`${eraAt(state.day).name}: users of this type take it for granted`}>
                      expected
                    </span>
                  ) : (
                    <span className={`tag kind ${fits ? 'good' : 'bad'}`}>{fits ? 'fits' : 'off-type'}</span>
                  )}
                  {studied && fits && <TasteTag likes={audienceLikes(typeId, tasteAudience, f.id)} />}
                </span>
                <span className="stars" title={`Value ${f.value}`}>
                  {'★'.repeat(f.value)}
                </span>
                <span className="costs">
                  {DISCIPLINES.map((d) => (
                    <span key={d} style={{ color: DISCIPLINE_COLORS[d] }}>
                      {Math.round(f.cost[d] * featureScale)}
                    </span>
                  ))}
                </span>
              </label>
            )
          })}
        </div>

        <div className="summary">
          <div className="targets">
            {DISCIPLINES.map((d) => (
              <span key={d} className="target" style={cssVars({ '--c': DISCIPLINE_COLORS[d] })}>
                {DISCIPLINE_LABELS[d]} <b>{Math.round(target[d])}</b>
              </span>
            ))}
          </div>
          <div className="muted">
            {spec.name} {type.name}: about <b>{formatDays(days)}</b> with your team
            {Number.isFinite(cost) && <> · ~{formatMoney(cost)} in wages</>}
          </div>
          {(!isUpdate || growsTo) && pmEffectText(state, office) && <div className="good">Your product manager steers it: {pmEffectText(state, office)}</div>}
          {budget > 0 && (
            <div className={budgetProblem ? 'bad' : 'muted'} title="Licences, servers, assets and freelancers. Client work is how a garage pays for it.">
              Budget <b>{formatMoney(budget)}</b>, paid now{budgetProblem ? `. ${budgetProblem.replace(/^Not enough money: the budget is [^,]+, and /, 'Keep ')}` : ''}
            </div>
          )}
          {!product && projectSize !== 'small' && (
            <div className="muted">
              Reaches {spec.reach}× as many {type.userNoun}, who stay interested {spec.life}× as long as a Small one's.
            </div>
          )}
          {product && (
            <div className="muted">
              Reach if finished on target: about <b>{formatCount(reach)}</b> {type.userNoun} ({formatCount(product.reach)} now)
            </div>
          )}
        </div>

        <div className="actions">
          {portfolioProblem && <p className="bad action-note">{portfolioProblem}</p>}
          {budgetProblem && <p className="bad action-note">Not enough money for the budget. Client work pays the bills and the budget.</p>}
          {error && <p className="bad action-note">{error}</p>}
          <button onClick={() => store.closeDialog()}>Cancel</button>
          <button className="primary" disabled={portfolioProblem !== null || budgetProblem !== null} title={portfolioProblem ?? budgetProblem ?? undefined} onClick={start}>
            {growsTo ? 'Start growing' : product ? (selected.length === 0 ? 'Start maintenance' : 'Start update') : 'Start project'}
            {budget > 0 && <small> · {formatMoney(budget)}</small>}
          </button>
        </div>
        </>
      )}
    </Modal>
  )
}
