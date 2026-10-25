import { AGENT_KINDS, AUTONOMY } from '@/lib/tycoon/data/agents'
import { formatMoney } from '@/lib/tycoon/format'
import { agentBill, agentCost, agentPower, availableAgents, levelOf, oversight } from '@/lib/tycoon/sim/agents'
import { useGame, useStore } from './context'

/** What a kind adds at its level, in words. */
function effectLine(kindEffect: string, amount: number): string {
  const pct = `${Math.round(amount * 100)}%`
  switch (kindEffect) {
    case 'speed':
      return `${pct} faster work, everywhere`
    case 'fixes':
      return `${pct} faster bug fixing`
    case 'insight':
      return `+${amount.toFixed(1)} insight a day`
    default:
      return `${pct} fewer of the hit's users leave`
  }
}

/** The AI agents: tools you tune. Each has a dial from off to unattended; more freedom does more, costs more and goes wrong more often. */
export function AgentsTab() {
  const store = useStore()
  const state = useGame()
  const open = new Set(availableAgents(state).map((k) => k.id))
  const bill = agentBill(state)

  return (
    <div className="agents">
      <p className="muted">
        Agents are tools, not people. Turn the dial up and they do more and cost more, and now and then one does something you wish it had not.
        Monitoring and test automation on the hit make that rarer ({Math.round(oversight(state) * 100)}% of incidents stopped now).
        {bill > 0 && ` The agents cost ${formatMoney(bill)} a day.`}
      </p>
      {open.size === 0 && <p className="muted">Nothing like this exists yet. Agents arrive with the AI wave.</p>}
      {AGENT_KINDS.map((kind) => {
        const level = levelOf(state, kind.id)
        const exists = open.has(kind.id)
        return (
          <section key={kind.id} className="section">
            <div className="section-head">
              <h3>{kind.name}</h3>
              <span className="muted">{exists ? (level > 0 ? `${effectLine(kind.effect, kind.perPower * agentPower(state, kind))} · ${formatMoney(agentCost(state, kind))}/day` : 'off') : 'not yet'}</span>
            </div>
            <p className="muted">{kind.blurb}</p>
            {exists && (
              <div className="segmented" role="group" aria-label={`${kind.name} freedom`}>
                {AUTONOMY.map((a) => (
                  <button
                    key={a.level}
                    className={a.level === level ? 'active' : ''}
                    title={`${a.blurb}${a.risk > 0 ? ` · about ${Math.round(a.risk * 100)}% a month that it goes wrong` : ''}`}
                    onClick={() => store.setAgent(kind.id, a.level)}
                  >
                    {a.name}
                  </button>
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
