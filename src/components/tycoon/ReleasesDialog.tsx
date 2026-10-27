import { getWorkItem } from '@/lib/tycoon/data/workstreams'
import { formatCount } from '@/lib/tycoon/format'
import { formatVersion, versionOf } from '@/lib/tycoon/sim/releases'
import type { ReleaseNote } from '@/lib/tycoon/sim/types'
import { useGame, useStore } from './context'
import { Modal } from './Modal'

const signed = (n: number): string => (n > 0 ? `+${n}` : `${n}`)

/** One release in a line: its version and requirement, and what it did to the product. */
export function ReleaseLine({ note }: { note: ReleaseNote }) {
  const reach = note.reachBefore > 0 ? Math.round((note.reachAfter / note.reachBefore - 1) * 100) : 0
  const fit = Math.round(note.fitAfter - note.fitBefore)
  const quality = Math.round(note.qualityAfter - note.qualityBefore)
  return (
    <div className="office-row">
      <span>
        <strong>
          {note.version}
          {note.title && `: ${note.title}`}
        </strong>{' '}
        <span className="muted">
          {note.by} · day {note.day}
          {note.clarity !== undefined && ` · spec ${note.clarity}% clear`}
        </span>
        <br />
        <small>
          <span className={reach >= 0 ? 'good' : 'bad'}>reach {signed(reach)}%</span> · <span className={fit >= 0 ? 'good' : 'bad'}>fit {signed(fit)}</span>
          {quality !== 0 && <> · quality {signed(quality)}</>} · {Math.round(note.bugsShipped)} new bugs
        </small>
      </span>
    </div>
  )
}

/** A product's release history, newest first, and what has been built into it. */
export function ReleasesDialog({ productId }: { productId: number }) {
  const store = useStore()
  const state = useGame()
  const product = state.products.find((p) => p.id === productId)
  if (!product) return null
  const notes = [...(product.releases ?? [])].reverse()

  return (
    <Modal title={`${product.name} ${formatVersion(versionOf(product))}: releases`} onClose={() => store.closeDialog()}>
      <p className="muted">
        Each floor's analysts read the product and its product manager writes a spec; you choose what the team builds, and it ships as the next
        version. {product.users < 1 ? '' : `${formatCount(product.users)} users now.`}
      </p>
      <section className="section">
        {notes.length === 0 && <p className="muted">No releases yet. The first spec is a few days away.</p>}
        {notes.map((note) => (
          <ReleaseLine key={`${note.version}-${note.day}`} note={note} />
        ))}
      </section>
      {(product.built ?? []).length > 0 && <p className="muted">Built into it: {(product.built ?? []).map((id) => getWorkItem(id)?.name ?? id).join(', ')}.</p>}
    </Modal>
  )
}
