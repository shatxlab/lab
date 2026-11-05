// Synthetic readiness fixtures, not evidence of played economics or earned products/research.
import { FEATURES } from '@/lib/tycoon/data/features'
import { foundPaidCompany, quoteFounding, foundingOffers } from '@/lib/tycoon/paid-founding'
import { initialiseOperations } from '@/lib/tycoon/sim/operations'
import type { VentureAmbition } from '@/lib/tycoon/sim/founder-finance'
import { stage0Fixture } from './stage0-fixtures'
import { paidFoundingSource, unwrap } from './paid-founding-fixtures'

export function charterFixture(ambition: VentureAmbition = 'venture') {
  const source = paidFoundingSource()
  const candidateIds = ambition === 'studio' ? unwrap(foundingOffers(source)).offers.filter((p) => p.role === 'designer' || p.role === 'tester').map((p) => p.id) : []
  const next = unwrap(foundPaidCompany(source, unwrap(quoteFounding(source, { companyId: 'synthetic-ready', companyName: 'Synthetic Ready', ambition, focus: 'web_app', candidateIds }))))
  const founding = next.game.founding!
  next.game = stage0Fixture('ipo')
  next.game.chapter = 2
  next.game.chapterStartDay = source.game.day
  next.game.founding = founding
  initialiseOperations(next.game)
  const hit = next.game.products[0]
  hit.size = 'flagship'
  hit.fit = hit.peakFit = hit.quality = 95
  hit.bugs = hit.pendingBugs = 0
  hit.featureIds = FEATURES.filter((f) => f.suits.includes(hit.productTypeId)).map((f) => f.id)
  for (const index of [1, 2]) next.game.offices[index].assignment = { kind: 'standing', service: 'reliability', productId: hit.id, startedDay: next.game.day }
  next.game.nemesesBeaten = 1
  return next
}
