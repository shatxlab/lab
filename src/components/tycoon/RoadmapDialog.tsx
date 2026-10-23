import { ALL_ITEMS, getWorkItem, WORKSTREAM_INFO } from '@/lib/tycoon/data/workstreams'
import { formatCount } from '@/lib/tycoon/format'
import { itemBlocker, ROADMAP_LIMIT } from '@/lib/tycoon/sim/roadmap'
import { useGame, useStore } from './context'
import { Modal } from './Modal'

/** The ranked list of workstream items for a product: the floors take from the top, each the highest one for its workstream. */
export function RoadmapDialog({ productId }: { productId: number }) {
  const store = useStore()
  const state = useGame()
  const product = state.products.find((p) => p.id === productId)
  if (!product) return null
  const ranked = product.roadmap ?? []
  const set = (ids: string[]) => store.setRoadmap(product.id, ids)
  const move = (index: number, by: number) => {
    const ids = [...ranked]
    ;[ids[index], ids[index + by]] = [ids[index + by], ids[index]]
    set(ids)
  }
  const more = ALL_ITEMS.filter((item) => !ranked.includes(item.id) && !(product.built ?? []).includes(item.id))

  return (
    <Modal title={`${product.name}: roadmap`} onClose={() => store.closeDialog()}>
      <p className="muted">
        The order of the work. A floor on Quality, Scale, Growth, Monetisation or Europe builds the highest item here for its workstream that is on
        offer. {product.users < 1 ? '' : `${formatCount(product.users)} users now.`}
      </p>
      <section className="section">
        <div className="section-head">
          <h3>Planned</h3>
          <span className="muted">
            {ranked.length}/{ROADMAP_LIMIT}
          </span>
        </div>
        {ranked.length === 0 && <p className="muted">Nothing planned. Add items below.</p>}
        {ranked.map((id, index) => {
          const item = getWorkItem(id)
          if (!item) return null
          const blocker = itemBlocker(state, product, item)
          return (
            <div key={id} className="office-row">
              <span>
                <strong>{index + 1}. {item.name}</strong> <span className="muted">{WORKSTREAM_INFO[item.workstream].name} · {item.blurb}</span>
                {blocker && <small className="warn"> · waiting: {blocker}</small>}
              </span>
              <span className="row-buttons">
                <button disabled={index === 0} aria-label="Move up" onClick={() => move(index, -1)}>▲</button>
                <button disabled={index === ranked.length - 1} aria-label="Move down" onClick={() => move(index, 1)}>▼</button>
                <button onClick={() => set(ranked.filter((other) => other !== id))}>Remove</button>
              </span>
            </div>
          )
        })}
      </section>
      <section className="section">
        <div className="section-head">
          <h3>Add</h3>
        </div>
        {more.length === 0 && <p className="muted">Everything is planned or built.</p>}
        {more.map((item) => {
          const blocker = itemBlocker(state, product, item)
          return (
            <div key={item.id} className="office-row">
              <span>
                <strong>{item.name}</strong> <span className="muted">{WORKSTREAM_INFO[item.workstream].name} · {item.blurb}</span>
                {blocker && <small className="muted"> · {blocker}</small>}
              </span>
              <span className="row-buttons">
                <button disabled={ranked.length >= ROADMAP_LIMIT || (blocker !== null && item.companionId !== undefined)} onClick={() => set([...ranked, item.id])}>Add</button>
              </span>
            </div>
          )
        })}
      </section>
      {(product.built ?? []).length > 0 && (
        <p className="muted">Built: {(product.built ?? []).map((id) => getWorkItem(id)?.name ?? id).join(', ')}.</p>
      )}
    </Modal>
  )
}
