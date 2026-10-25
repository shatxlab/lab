import { ALL_ITEMS, effectText, getWorkItem, WORKSTREAM_INFO } from '@/lib/tycoon/data/workstreams'
import { getFeature } from '@/lib/tycoon/data/features'
import { formatCount } from '@/lib/tycoon/format'
import { officeName } from '@/lib/tycoon/sim/offices'
import { builderOf, isStepId, ROADMAP_LIMIT, rowBlocker, rowInfo, STEP_IDS } from '@/lib/tycoon/sim/roadmap'
import { nextStep } from '@/lib/tycoon/sim/roadmap'
import { useGame, useStore } from './context'
import { Modal } from './Modal'

/** What a row does, in a few words: an item's effects in numbers, or a step's blurb. */
function effectOf(id: string, queued: string[]): string {
  if (id === 'features') return queued.length > 0 ? queued.map((f) => getFeature(f).name).join(', ') : 'Queue features from the product panel'
  const item = getWorkItem(id)
  return item ? effectText(item.effect) || item.blurb : (rowInfo(id)?.blurb ?? '')
}

/** The one ranked list of work for a product: every floor takes the first row it may, so the order is the plan. */
export function RoadmapDialog({ productId }: { productId: number }) {
  const store = useStore()
  const state = useGame()
  const product = state.products.find((p) => p.id === productId)
  if (!product) return null
  const ranked = product.roadmap ?? []
  const queued = product.nextFeatures ?? []
  const set = (ids: string[]) => store.setRoadmap(product.id, ids)
  const move = (index: number, by: number) => {
    const ids = [...ranked]
    ;[ids[index], ids[index + by]] = [ids[index + by], ids[index]]
    set(ids)
  }
  const floors = state.offices.filter((o) => o.productId === product.id)
  const next = new Map(floors.map((o) => [o.id, nextStep(state, product, o.workstream ?? 'features')]))
  const upNextFor = (id: string) => floors.filter((o) => !o.project && (next.get(o.id)?.kind === 'item' ? (next.get(o.id) as { item: { id: string } }).item.id === id : next.get(o.id)?.kind === id))
  const more = [...ALL_ITEMS.map((i) => i.id), ...STEP_IDS].filter((id) => !ranked.includes(id) && !(product.built ?? []).includes(id) && rowBlocker(state, product, id) !== 'Done already')

  const row = (id: string, index: number | null) => {
    const info = rowInfo(id)
    if (!info) return null
    const blocker = rowBlocker(state, product, id)
    const builder = builderOf(state, id)
    const upNext = index !== null && !builder && !blocker ? upNextFor(id) : []
    const isCompanion = getWorkItem(id)?.companionId !== undefined
    return (
      <div key={id} className="office-row">
        <span>
          <strong>
            {index !== null && `${index + 1}. `}
            {info.name}
          </strong>{' '}
          <span className="muted">
            {isStepId(id) ? 'Step' : WORKSTREAM_INFO[info.workstream].name} · {effectOf(id, queued)}
          </span>
          {builder && <small className="ok"> · {officeName(state, builder)} is building it</small>}
          {upNext.length > 0 && <small className="ok"> · next for {upNext.map((o) => officeName(state, o)).join(', ')}</small>}
          {blocker && <small className={index === null ? 'muted' : 'warn'}> · {index === null ? blocker : `waiting: ${blocker}`}</small>}
        </span>
        <span className="row-buttons">
          {index === null ? (
            <button disabled={ranked.length >= ROADMAP_LIMIT || (blocker !== null && isCompanion)} onClick={() => set([...ranked, id])}>
              Add
            </button>
          ) : (
            <>
              <button disabled={index === 0} aria-label="Move up" onClick={() => move(index, -1)}>▲</button>
              <button disabled={index === ranked.length - 1} aria-label="Move down" onClick={() => move(index, 1)}>▼</button>
              <button onClick={() => set(ranked.filter((other) => other !== id))}>Remove</button>
            </>
          )}
        </span>
      </div>
    )
  }

  return (
    <Modal title={`${product.name}: roadmap`} onClose={() => store.closeDialog()}>
      <p className="muted">
        One list of everything the team builds. Each floor takes the first row from the top that it can start; a row that is waiting is skipped
        until it can. {product.users < 1 ? '' : `${formatCount(product.users)} users now.`}
      </p>
      <section className="section">
        <div className="section-head">
          <h3>Planned</h3>
          <span className="muted">
            {ranked.length}/{ROADMAP_LIMIT}
          </span>
        </div>
        {ranked.length === 0 && <p className="muted">Nothing planned: the team keeps the product fresh and ships queued features. Add rows below.</p>}
        {ranked.map((id, index) => row(id, index))}
      </section>
      <section className="section">
        <div className="section-head">
          <h3>Add</h3>
        </div>
        {more.length === 0 && <p className="muted">Everything is planned or built.</p>}
        {more.map((id) => row(id, null))}
      </section>
      {(product.built ?? []).length > 0 && <p className="muted">Built: {(product.built ?? []).map((id) => getWorkItem(id)?.name ?? id).join(', ')}.</p>}
    </Modal>
  )
}
