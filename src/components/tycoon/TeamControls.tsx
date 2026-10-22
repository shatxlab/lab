import { getFeature } from '@/lib/tycoon/data/features'
import { BREAKS_MORALE, BREAKS_SPEED, STANDUP_MORALE, STANDUP_SPEED } from '@/lib/tycoon/sim/balance'
import { inGarage, officeName } from '@/lib/tycoon/sim/offices'
import { DEFAULT_DIRECTION, DIRECTION_INFO, nextReleaseDay, nextReleasePlan, ownedProduct, ownerOf } from '@/lib/tycoon/sim/teams'
import { DIRECTIONS, type Direction, type Office, type Product } from '@/lib/tycoon/sim/types'
import { useGame, useStore } from './context'

/** "in 3 days", "tomorrow", "now": how long until a day. */
function until(days: number): string {
  if (days <= 0) return 'now'
  return days === 1 ? 'tomorrow' : `in ${days} days`
}

/** On a product: which floor's team looks after it, what they are told to do with it, and what its next release will hold. */
export function ProductTeam({ product }: { product: Product }) {
  const store = useStore()
  const state = useGame()
  if (inGarage(state)) return null
  const owner = ownerOf(state, product.id)
  const direction = owner?.direction ?? DEFAULT_DIRECTION
  const queued = product.nextFeatures ?? []

  return (
    <div className="product-team">
      <label>
        Team{' '}
        <select
          value={owner?.id ?? ''}
          onChange={(e) => {
            if (e.target.value !== '') store.assignProduct(Number(e.target.value), product.id)
            else if (owner) store.assignProduct(owner.id, null)
          }}
        >
          <option value="">nobody: it only gets what you start</option>
          {state.offices.map((office) => {
            const theirs = ownedProduct(state, office)
            return (
              <option key={office.id} value={office.id}>
                {officeName(state, office)}
                {theirs && theirs.id !== product.id ? ` (leaves ${theirs.name})` : ''}
              </option>
            )
          })}
        </select>
      </label>
      {owner && (
        <>
          <label title={DIRECTION_INFO[direction].blurb}>
            Direction{' '}
            <select value={direction} onChange={(e) => store.setDirection(owner.id, e.target.value as Direction)}>
              {DIRECTIONS.map((d) => (
                <option key={d} value={d}>
                  {DIRECTION_INFO[d].name}
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => store.openDialog({ kind: 'queue', productId: product.id })} title="The features the team adds when it grows the product">
            Next release: {queued.length > 0 ? queued.map((id) => getFeature(id).name).join(', ') : 'nothing queued'}…
          </button>
          <small className="muted">
            {owner.project?.parentId === product.id
              ? `${officeName(state, owner)} is working on it now.`
              : owner.project
                ? `${officeName(state, owner)} is busy with ${owner.project.name}; it gets back to ${product.name} after.`
                : `Next: ${nextReleasePlan(state, owner, product)}, ${until(nextReleaseDay(state, owner, product) - state.day)}.`}{' '}
            {DIRECTION_INFO[direction].blurb}.
          </small>
        </>
      )}
    </div>
  )
}

/** A floor's daily routines: a morning stand-up and coffee breaks, each a trade between pace and mood. */
export function Routines({ office }: { office: Office }) {
  const store = useStore()
  if (office.kind === 'garage') return null
  const percent = (factor: number) => `${factor > 1 ? '+' : ''}${Math.round((factor - 1) * 100)}%`
  return (
    <div className="routines" role="group" aria-label="Routines">
      <button
        aria-pressed={office.standup === true}
        className={office.standup ? 'active' : ''}
        title={`Every morning in the meeting room: ${percent(STANDUP_SPEED)} pace and fewer bugs, ${-STANDUP_MORALE} morale`}
        onClick={() => store.setRoutine(office.id, 'standup', !office.standup)}
      >
        Stand-up {office.standup ? 'on' : 'off'}
      </button>
      <button
        aria-pressed={office.breaks === true}
        className={office.breaks ? 'active' : ''}
        title={`Coffee and snacks along the wall: +${BREAKS_MORALE} morale, ${percent(BREAKS_SPEED)} pace`}
        onClick={() => store.setRoutine(office.id, 'breaks', !office.breaks)}
      >
        Coffee breaks {office.breaks ? 'on' : 'off'}
      </button>
    </div>
  )
}
