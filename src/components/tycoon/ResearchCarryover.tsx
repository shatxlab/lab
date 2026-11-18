import { AUDIENCES } from '@/lib/tycoon/data/audiences'
import { getResearch, unlocksOf } from '@/lib/tycoon/data/research'
import { getStage } from '@/lib/tycoon/data/stages'
import { eraPhrase, ERAS } from '@/lib/tycoon/data/eras'
import { researchTransferPreview } from '@/lib/tycoon/sim/research-knowledge'
import { formatMoney } from '@/lib/tycoon/format'
import { useGame } from './context'

/** Read-only next-venture contract, shown before either good or bad ending's continue action. */
export function ResearchCarryover() {
  const state = useGame()
  const transfer = researchTransferPreview(state)
  return <section className="research-carryover" aria-label="Research carry-over preview">
    <strong>Next venture: what you keep</strong>
    <p>{transfer.knowledge.length} learned content permissions · {transfer.practices.length} company-practice blueprints · {transfer.audiences.length} studied audiences. Knowledge and completed studies survive every ending, including bankruptcy.</p>
    <p>Company practices become inactive in the new company. Their learned blueprints are kept, but restoring each practice is optional and costs its normal full price and work again. No automatic charge or research selection. Current-company benefits stay active until you leave.</p>
    <p>Learned permissions do not waive reputation, era, team or product requirements. Products, built tools, staff assignments and unfinished research stay with the old company.</p>
    <details><summary>Retained knowledge and audience results</summary>
      {transfer.knowledge.length > 0 ? <ul>{transfer.knowledge.map((node) => {
        const unlocks = unlocksOf(node.id)
        return <li key={node.id}><strong>{node.name}</strong>: {[...unlocks.features, ...unlocks.productTypes, ...unlocks.abilities].join('; ')}{node.carry === 'mixed' ? '. Content permission stays; the design-speed practice must be re-established.' : ''}</li>
      })}</ul> : <p>No learned content permissions yet.</p>}
      <p>{transfer.audiences.length ? `Studied audiences: ${transfer.audiences.map((id) => AUDIENCES.find((a) => a.id === id)?.name ?? id).join(', ')}.` : 'No completed audience studies yet.'}</p>
    </details>
    <details><summary>Practices to re-establish · costs and requirements</summary>
      {transfer.practices.length > 0 ? <ul>{transfer.practices.map((node) => <li key={node.id}>
        <strong>{node.name}</strong> · {formatMoney(node.cost)} · {node.days} base research work-days.
        {' '}Needs {node.requires.length ? node.requires.map((id) => getResearch(id)?.name ?? id).join(', ') : 'no prerequisite research'}.
        {node.stage !== undefined && ` Company stage: ${getStage(node.stage).name}.`}
        {node.era !== undefined && ` World era: ${eraPhrase(ERAS[node.era])}.`}
      </li>)}</ul> : <p>No company practices to re-establish.</p>}
      <p>To establish a company practice, prerequisite company practices must be active here; pure knowledge prerequisites stay learned. Learning new theory may use learned prerequisite blueprints. Before Operations, research follows its normal day timer; in Operations it needs actual standing analyst/PM output. No assigned capacity means no staffed research progress.</p>
    </details>
    {transfer.unfinished && <p className="warn">Unfinished research ({getResearch(transfer.unfinished)?.name ?? transfer.unfinished}) does not transfer or receive a refund. Only completed learning/results are retained.</p>}
  </section>
}
