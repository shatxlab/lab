import { eraAt, eraIndexAt } from '@/lib/tycoon/data/eras'
import { PRODUCT_TYPES } from '@/lib/tycoon/data/productTypes'
import { MARKET_COLD, MARKET_HOT } from '@/lib/tycoon/sim/balance'
import { marketDemand } from '@/lib/tycoon/sim/market'
import { marketWeights } from '@/lib/tycoon/sim/products'
import { acquisitionBlocker, acquisitionPrice, standings } from '@/lib/tycoon/sim/rivals'
import { ACQUISITION_STAGE } from '@/lib/tycoon/sim/balance'
import { useGame, useStore } from './context'
import { formatDemand, formatMoney } from '@/lib/tycoon/format'

/** Crowding in words: how much the other products in a market hold yours back. */
export function crowdLabel(crowd: number): { text: string; tone: string } {
  if (crowd < 0.25) return { text: 'wide open', tone: 'good' }
  if (crowd < 0.6) return { text: 'competitive', tone: 'muted' }
  if (crowd < 1.2) return { text: 'crowded', tone: 'warn' }
  return { text: 'packed', tone: 'bad' }
}

/** Where the studio stands against the competition, and what each market looks like right now. */
export function IndustryTab() {
  const store = useStore()
  const state = useGame()
  const rows = standings(state)
  const canBuy = state.stage >= ACQUISITION_STAGE
  const weights = marketWeights(state)
  const era = eraAt(state.day)

  return (
    <div className="industry">
      <p>
        <strong>{era.name}.</strong> <span className="muted">{era.blurb}</span>
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Studio</th>
              <th className="num">Income / day</th>
              <th className="num">Reputation</th>
              <th>Biggest product</th>
              {canBuy && <th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id} className={row.id === 0 ? 'you' : ''}>
                <td>{index + 1}</td>
                <td>{row.name}</td>
                <td className="num">{formatMoney(row.revenue)}</td>
                <td className="num">{Math.round(row.reputation)}</td>
                <td>{row.best ?? '—'}</td>
                {canBuy && (
                  <td>
                    {row.id !== 0 && (() => {
                      const rival = state.rivals.find((r) => r.id === row.id)!
                      const blocker = acquisitionBlocker(state, rival)
                      return (
                        <button disabled={blocker !== null} title={blocker ?? 'Its products become yours'} onClick={() => store.acquire(rival.id)}>
                          Buy · {formatMoney(acquisitionPrice(state, rival))}
                        </button>
                      )
                    })()}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Markets</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th className="num">Demand</th>
              <th className="num">Yours</th>
              <th className="num">Rivals'</th>
              <th>Competition</th>
            </tr>
          </thead>
          <tbody>
            {PRODUCT_TYPES.filter((t) => t.era <= eraIndexAt(state.day)).map((type) => {
              const demand = marketDemand(state, type.id)
              const crowd = crowdLabel(weights.get(type.id) ?? 0)
              const yours = state.products.filter((p) => p.productTypeId === type.id).length
              const theirs = state.rivalProducts.filter((p) => p.productTypeId === type.id).length
              return (
                <tr key={type.id}>
                  <td>{type.name}</td>
                  <td className={`num ${demand >= MARKET_HOT ? 'good' : demand <= MARKET_COLD ? 'bad' : ''}`}>{formatDemand(demand)}</td>
                  <td className="num">{yours}</td>
                  <td className="num">{theirs}</td>
                  <td className={crowd.tone}>{crowd.text}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="muted">
        Every product competes with the others of its type, yours included, for the same people: the more reach a market
        holds, the fewer users each product in it gets.
      </p>
    </div>
  )
}
