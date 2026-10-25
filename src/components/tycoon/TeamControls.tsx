import { getFeature } from '@/lib/tycoon/data/features'
import { inGarage, officeName } from '@/lib/tycoon/sim/offices'
import { DEFAULT_WORKSTREAM, nextReleaseDay, nextReleasePlan, ownedProduct, ownerOf } from '@/lib/tycoon/sim/teams'
import { WORKSTREAM_INFO } from '@/lib/tycoon/data/workstreams'
import { WORKSTREAMS, type Product, type Workstream } from '@/lib/tycoon/sim/types'
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
  const stream = owner?.workstream ?? DEFAULT_WORKSTREAM
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
          <label title={WORKSTREAM_INFO[stream].blurb}>
            Focus (optional){' '}
            <select value={stream} onChange={(e) => store.setWorkstream(owner.id, e.target.value as Workstream)}>
              {WORKSTREAMS.map((w) => (
                <option key={w} value={w}>
                  {WORKSTREAM_INFO[w].name}
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => store.openDialog({ kind: 'queue', productId: product.id })} title="The features the team adds when it grows the product">
            Next release: {queued.length > 0 ? queued.map((id) => getFeature(id).name).join(', ') : 'nothing queued'}…
          </button>
          <button onClick={() => store.openDialog({ kind: 'roadmap', productId: product.id })} title="The one list of work: each floor takes the first row it can start">
            Roadmap: {(product.roadmap ?? []).length > 0 ? `${product.roadmap!.length} planned` : 'empty'}…
          </button>
          <small className="muted">
            {owner.project?.parentId === product.id
              ? `${officeName(state, owner)} is working on it now.`
              : owner.project
                ? `${officeName(state, owner)} is busy with ${owner.project.name}; it gets back to ${product.name} after.`
                : nextReleaseDay(state, owner, product) === Number.MAX_SAFE_INTEGER
                  ? `${nextReleasePlan(state, owner, product)}.`
                  : `Next: ${nextReleasePlan(state, owner, product)}, ${until(nextReleaseDay(state, owner, product) - state.day)}.`}{' '}
            {WORKSTREAM_INFO[stream].blurb}.
          </small>
        </>
      )}
    </div>
  )
}
