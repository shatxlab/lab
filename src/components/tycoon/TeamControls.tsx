import { inGarage, officeName } from '@/lib/tycoon/sim/offices'
import { floorCycle } from '@/lib/tycoon/sim/cycle'
import { formatVersion, versionOf } from '@/lib/tycoon/sim/releases'
import { ownedProduct, ownerOf } from '@/lib/tycoon/sim/teams'
import type { Product } from '@/lib/tycoon/sim/types'
import { useGame, useStore } from './context'

/** On a product: which floor's team looks after it, what they are told to do with it, and what its next release will hold. */
export function ProductTeam({ product }: { product: Product }) {
  const store = useStore()
  const state = useGame()
  if (inGarage(state)) return null
  const owner = ownerOf(state, product.id)

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
          <button onClick={() => store.openDialog({ kind: 'releases', productId: product.id })} title="Every release so far, and what it did">
            {formatVersion(versionOf(product))} · Releases…
          </button>
          <small className="muted">
            {officeName(state, owner)}: {floorCycle(state, owner)}.
          </small>
        </>
      )}
    </div>
  )
}
