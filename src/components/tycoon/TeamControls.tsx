import { getFeature } from '@/lib/tycoon/data/features'
import { inGarage, officeName } from '@/lib/tycoon/sim/offices'
import { DEFAULT_DIRECTION, DIRECTION_INFO, nextReleaseDay, nextReleasePlan, ownedProduct, ownerOf } from '@/lib/tycoon/sim/teams'
import { DIRECTIONS, type Direction, type Product } from '@/lib/tycoon/sim/types'
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
