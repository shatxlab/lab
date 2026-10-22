import { useState } from 'react'
import { getProductType } from '@/lib/tycoon/data/productTypes'
import { CAMPAIGNS } from '@/lib/tycoon/sim/balance'
import { campaignAudience, campaignCost, estimateReach } from '@/lib/tycoon/sim/lifecycle'
import { releaseBugs, revenueForUsers, settledUsers } from '@/lib/tycoon/sim/products'
import { hitBreakdown, projectQuality, reachAfterUpdate } from '@/lib/tycoon/sim/project'
import { isReady } from '@/lib/tycoon/sim/scoring'
import { TIERS, type Tier } from '@/lib/tycoon/sim/types'
import { useGame, useOffice, useStore } from './context'
import { formatCount, formatMoney, qualityLabel, TIER_NAME } from '@/lib/tycoon/format'
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
  const reach = isUpdate && product ? reachAfterUpdate(product, project, quality) : estimateReach(state, project, quality)
  const bugs = Math.round(releaseBugs(project))
  const settled = settledUsers(state, project.productTypeId, project.featureIds, reach)
  const price = campaign ? campaignCost(state, project, quality, campaign) : 0
  const rolls = !isUpdate || (project.grows !== undefined && !product?.hit)
  const hit = rolls ? hitBreakdown(state, project, quality, isUpdate ? undefined : campaign ?? undefined) : null
  const chance = hit?.chance ?? 0

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
      {hit && (
        <div className="muted" title="A hit reaches several times as many people. Quality, a hot market, buzz and every good launch without one make it likelier.">
          <p>
            🚀 Chance it breaks out: <strong>{Math.round(chance * 100)}%</strong>
            {chance === 0 && ' (it needs quality 70 or more)'}
            {hit.capped && ' (the highest it can get)'}
          </p>
          {chance > 0 && (
            <ul className="hit-factors">
              <li>
                Streak: {hit.misses} good launch{hit.misses === 1 ? '' : 'es'} without a hit, a starting {(hit.base * 100).toFixed(1)}%
              </li>
              <li className={hit.quality >= 1 ? 'good' : 'warn'}>Quality {Math.round(quality)}: {factorLabel(hit.quality)}</li>
              <li className={hit.market >= 1 ? 'good' : 'warn'}>
                {type.name} market: {hit.market >= 1.05 ? 'hot' : hit.market <= 0.95 ? 'cold' : 'steady'} {factorLabel(hit.market)}
              </li>
              {project.featureIds.length > 0 && (
                <li className={hit.audience > 1.05 ? 'good' : ''}>
                  Audience fit: {hit.audience > 1.05 ? 'it has features they love' : 'nothing they love yet'} {factorLabel(hit.audience)}
                </li>
              )}
              {hit.pm > 1 && <li className="good">Product manager steering it {factorLabel(hit.pm)}</li>}
              <li className={hit.buzz > 1 ? 'good' : ''}>
                Buzz: {campaign ? `${TIER_NAME[campaign]} campaign` : 'no campaign'} {factorLabel(hit.buzz)}
              </li>
            </ul>
          )}
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

/** A multiplier as a short effect: ×1.2, or ×0.8 when it holds the chance back. */
function factorLabel(factor: number): string {
  return `×${factor.toFixed(2)}`
}
