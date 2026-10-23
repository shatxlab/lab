import { useState } from 'react'
import { getProductType } from '@/lib/tycoon/data/productTypes'
import { CAMPAIGNS, FIT_TAKEOFF, MARKET_COLD, MARKET_HOT, TAKEOFF_MAX_CROWDING } from '@/lib/tycoon/sim/balance'
import { releaseKey } from '@/lib/tycoon/sim/fit'
import { marketDemand } from '@/lib/tycoon/sim/market'
import { campaignAudience, campaignCost, estimateReach } from '@/lib/tycoon/sim/lifecycle'
import { crowdingAround, marketCrowding, releaseBugs, revenueForUsers, settledUsers } from '@/lib/tycoon/sim/products'
import { projectFit, projectQuality, reachAfterUpdate, updateFit } from '@/lib/tycoon/sim/project'
import { isReady } from '@/lib/tycoon/sim/scoring'
import { TIERS, type Tier } from '@/lib/tycoon/sim/types'
import { useGame, useOffice, useStore } from './context'
import { formatCount, formatMoney, qualityLabel, TIER_NAME } from '@/lib/tycoon/format'
import { FitMeter } from './FitMeter'
import { crowdLabel } from './IndustryTab'
import { Modal } from './Modal'

/** The last step before release: new products can buy launch marketing; updates just go out. */
export function ShipDialog({ officeId }: { officeId: number }) {
  const store = useStore()
  const state = useGame()
  const office = useOffice(officeId)
  const [campaign, setCampaign] = useState<Tier | null>(null)
  const [error, setError] = useState('')

  const project = office.project
  if (!project) return null
  const isUpdate = project.kind === 'update'
  const product = state.products.find((p) => p.id === project.parentId)

  const type = getProductType(project.productTypeId)
  const quality = projectQuality(state, project)
  const reach = isUpdate && product ? reachAfterUpdate(state, product, project, quality) : estimateReach(state, project, quality)
  const bugs = Math.round(releaseBugs(project))
  const settled = settledUsers(state, project.productTypeId, project.featureIds, reach)
  const price = campaign ? campaignCost(state, project, quality, campaign) : 0
  const fit = isUpdate && product ? updateFit(state, product, project, quality) : projectFit(state, project, quality)
  // The range for the release about to ship: the product's next one, or a new product's first.
  const fitKey = isUpdate && product ? releaseKey({ id: product.id, updates: [...product.updates, { day: state.day }] }) : releaseKey({ id: project.id, updates: [] })
  const demand = marketDemand(state, project.productTypeId)
  const crowd = isUpdate && product ? crowdingAround(state, product) : marketCrowding(state, project.productTypeId)

  const confirm = () => {
    const result = store.shipProject(campaign ?? undefined, office.id)
    if (!result.ok) setError(result.reason)
  }

  return (
    <Modal title={isUpdate ? `Release update for ${project.name}` : `Launch ${project.name}`} onClose={() => store.closeDialog()}>
      <p>
        Quality <strong>{Math.round(quality)}</strong> ({qualityLabel(quality)}).{' '}
        {!isReady(project) && <span className="bad">Not every bar has reached its target, so shipping now costs quality.</span>}
      </p>
      <p className="muted">
        It ships with about <strong>{bugs}</strong> bug{bugs === 1 ? '' : 's'}; more QA catches more of them before {type.userNoun} do.
      </p>

      {!isUpdate && (
        <div className="campaigns" role="radiogroup" aria-label="Launch marketing">
          <label className={`campaign ${campaign === null ? 'on' : ''}`}>
            <input type="radio" name="campaign" checked={campaign === null} onChange={() => setCampaign(null)} />
            <span className="campaign-name">No campaign</span>
            <span className="muted">free</span>
          </label>
          {TIERS.map((tier) => {
            const cost = campaignCost(state, project, quality, tier)
            const broke = cost > state.money
            return (
              <label key={tier} className={`campaign ${campaign === tier ? 'on' : ''} ${broke ? 'locked' : ''}`}>
                <input type="radio" name="campaign" disabled={broke} checked={campaign === tier} onChange={() => setCampaign(tier)} />
                <span className="campaign-name">
                  {TIER_NAME[tier]} campaign
                  <small className="muted">
                    {' '}
                    +{formatCount(campaignAudience(state, project, quality) * CAMPAIGNS[tier].users)} {type.userNoun} over {CAMPAIGNS[tier].days} days
                  </small>
                </span>
                <span className={broke ? 'bad' : ''}>-{formatMoney(cost)}</span>
              </label>
            )
          })}
        </div>
      )}

      <p className="muted">
        {isUpdate && product ? (
          <>
            Brings {type.userNoun} back to full interest. It can reach about <strong>{formatCount(reach)}</strong>{' '}
            {type.userNoun} ({formatCount(product.reach)} now).
          </>
        ) : (
          <>
            It could reach about {formatCount(reach)} {type.userNoun}. Against the competition, expect about{' '}
            <strong>{formatCount(settled)}</strong>, earning about <strong>{formatMoney(revenueForUsers(project.productTypeId, settled, project.audienceId))}</strong>{' '}
            per day once they have signed up.
          </>
        )}
        {price > 0 && ` The campaign costs ${formatMoney(price)} up front.`}
      </p>
      {!product?.hit && (
        <div className="muted">
          <FitMeter fit={fit} rangeKey={fitKey} label={isUpdate ? 'Fit after this release' : 'Fit at launch'} />
          <p>
            {type.name} market: {demand >= MARKET_HOT ? 'hot' : demand <= MARKET_COLD ? 'cold' : 'steady'}, {crowdLabel(crowd).text}.{' '}
            {demand <= MARKET_COLD
              ? 'Nothing takes off in a cold market.'
              : crowd >= TAKEOFF_MAX_CROWDING
                ? 'Too crowded for anything to take off now.'
                : `Room to take off, once the fit passes ${FIT_TAKEOFF}.`}
          </p>
        </div>
      )}

      <div className="actions">
        {error && <p className="bad action-note">{error}</p>}
        <button onClick={() => store.closeDialog()}>Back</button>
        <button className="primary" onClick={confirm}>
          {isUpdate ? 'Release update' : 'Launch'}
        </button>
      </div>
    </Modal>
  )
}

