import { useState } from 'react'
import { getAudience } from '@/lib/tycoon/data/audiences'
import { getProductType } from '@/lib/tycoon/data/productTypes'
import { BRANCHES, RESEARCH, unlocksOf, type ResearchNode } from '@/lib/tycoon/data/research'
import { researchBlocker, researchDaysLeft, studyTargets } from '@/lib/tycoon/sim/research'
import { knowsResearch } from '@/lib/tycoon/sim/research-knowledge'
import { ResearchCarryover } from './ResearchCarryover'
import { isResearched } from '@/lib/tycoon/sim/unlocks'
import { useGame, useStore } from './context'
import { formatMoney } from '@/lib/tycoon/format'
import { Modal } from './Modal'
import { cssVars } from './style'

function ResearchRow({ node }: { node: ResearchNode }) {
  const store = useStore()
  const state = useGame()
  const known = !node.repeatable && knowsResearch(state, node.id)
  const done = isResearched(state, node.id) || (node.carry === 'knowledge' && known)
  const inactive = known && !done && (node.carry === 'practice' || node.carry === 'mixed')
  const active = state.research.active?.id === node.id
  const blocker = researchBlocker(state, node)
  const { features, productTypes, abilities } = unlocksOf(node.id)
  const targets = node.repeatable ? studyTargets(state) : []
  const [target, setTarget] = useState('')
  const chosen = targets.includes(target) ? target : targets[0]

  return (
    <div className={`research-node ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
      <div className="research-head">
        <strong>{node.name}</strong>
        <span className="muted">
          {formatMoney(node.cost)} · {node.days} {state.offices.some((o) => o.assignment) ? 'specialist days' : 'days'}
        </span>
      </div>
      <small className="muted">{node.carry === 'knowledge' ? 'Founder knowledge · retained across ventures' : node.carry === 'study' ? 'Completed audience results · retained across ventures' : node.carry === 'mixed' ? 'Content knowledge retained; company practice needs activation' : 'Company practice · needs re-establishment in each new company'}</small>
      <p className="muted">{node.description}</p>
      {inactive && <p className="warn">Blueprint known — inactive in this company. Re-establish for the normal full price and work shown above; no automatic spending.{node.carry === 'mixed' ? ' Accessibility permission is already retained; the speed multiplier is not active.' : ''}</p>}
      {(features.length > 0 || productTypes.length > 0 || abilities.length > 0) && (
        <p className="unlocks">
          Unlocks: {[...productTypes.map((t) => `${t} (product)`), ...features, ...abilities].join(', ')}
        </p>
      )}
      {done && !node.repeatable ? (
        <span className="good">{node.carry === 'knowledge' ? '✓ Knowledge retained' : '✓ Active in this company'}</span>
      ) : (
        <>
          {node.repeatable && targets.length > 0 && (
            <select aria-label="Audience to study" value={chosen} onChange={(event) => setTarget((event.target as HTMLSelectElement).value)}>
              {targets.map((id) => (
                <option key={id} value={id}>
                  {getProductType(getAudience(id).productTypeId).name}: {getAudience(id).name}
                </option>
              ))}
            </select>
          )}
          <button
            className={blocker === null ? 'primary' : ''}
            disabled={blocker !== null}
            onClick={() => store.startResearch(node.id, node.repeatable ? chosen : undefined)}
          >
            {active ? 'In progress' : blocker ?? (node.repeatable ? 'Study' : 'Research')}
          </button>
        </>
      )}
    </div>
  )
}

export function ResearchDialog() {
  const store = useStore()
  const state = useGame()
  const active = state.research.active
  const activeNode = RESEARCH.find((n) => n.id === active?.id)
  const left = researchDaysLeft(state)
  const staffed = state.offices.some((o) => o.assignment)
  const progress = active?.remainingWork !== undefined ? 1 - active.remainingWork / (activeNode?.days ?? 1) : left !== null && Number.isFinite(left) ? 1 - left / (activeNode?.days ?? 1) : 0

  return (
    <Modal title="Research" onClose={() => store.closeDialog()}>
      {activeNode && left !== null ? (
        <div className="research-active">
          <div className="research-head">
            <strong>Researching: {activeNode.name}{active?.target ? ` · ${getAudience(active.target).name}` : ''}</strong>
            <span className="muted">{Number.isFinite(left) ? `${left} days left` : 'Stalled — assign analysts to research'}</span>
          </div>
          <div className="track">
            <div className="fill" style={cssVars({ width: `${Math.max(0, Math.min(1, progress)) * 100}%`, '--c': 'var(--accent)' })} />
          </div>
        </div>
      ) : (
        <p className="muted">{staffed ? 'Nothing is being researched. Assign a floor with analysts to research, then pay for a project. Reassignment pauses progress, not the company.' : 'Nothing is being researched. Research runs in the background while you work on projects.'}</p>
      )}

      <details><summary>Next-venture carry-over preview</summary><ResearchCarryover /></details>
      <div className="research-branches">
        {BRANCHES.map((branch) => (
          <section key={branch.id} className="research-branch">
            <h3>{branch.name}</h3>
            {RESEARCH.filter((n) => n.branch === branch.id).map((node) => (
              <ResearchRow key={node.id} node={node} />
            ))}
          </section>
        ))}
      </div>

      <div className="actions">
        <button onClick={() => store.closeDialog()}>Close</button>
      </div>
    </Modal>
  )
}
