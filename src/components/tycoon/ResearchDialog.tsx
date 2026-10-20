import { useState } from 'react'
import { getAudience } from '@/lib/tycoon/data/audiences'
import { getProductType } from '@/lib/tycoon/data/productTypes'
import { BRANCHES, RESEARCH, unlocksOf, type ResearchNode } from '@/lib/tycoon/data/research'
import { researchBlocker, researchDaysLeft, studyTargets } from '@/lib/tycoon/sim/research'
import { isResearched } from '@/lib/tycoon/sim/unlocks'
import { useGame, useStore } from './context'
import { formatMoney } from '@/lib/tycoon/format'
import { Modal } from './Modal'
import { cssVars } from './style'

function ResearchRow({ node }: { node: ResearchNode }) {
  const store = useStore()
  const state = useGame()
  const done = isResearched(state, node.id)
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
          {formatMoney(node.cost)} · {node.days} days
        </span>
      </div>
      <p className="muted">{node.description}</p>
      {(features.length > 0 || productTypes.length > 0 || abilities.length > 0) && (
        <p className="unlocks">
          Unlocks: {[...productTypes.map((t) => `${t} (product)`), ...features, ...abilities].join(', ')}
        </p>
      )}
      {done && !node.repeatable ? (
        <span className="good">✓ Done</span>
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

  return (
    <Modal title="Research" onClose={() => store.closeDialog()}>
      {activeNode && left !== null ? (
        <div className="research-active">
          <div className="research-head">
            <strong>Researching: {activeNode.name}{active?.target ? ` · ${getAudience(active.target).name}` : ''}</strong>
            <span className="muted">{left} days left</span>
          </div>
          <div className="track">
            <div className="fill" style={cssVars({ width: `${((activeNode.days - left) / activeNode.days) * 100}%`, '--c': 'var(--accent)' })} />
          </div>
        </div>
      ) : (
        <p className="muted">Nothing is being researched. Research runs in the background while you work on projects.</p>
      )}

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
