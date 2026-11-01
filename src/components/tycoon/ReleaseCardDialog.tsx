import { useGame, useStore } from './context'
import { Modal } from './Modal'

const signed = (n: number): string => (n > 0 ? `+${n}` : `${n}`)

function Row({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="release-row">
      <span className="muted">{label}</span>
      <strong className={good ? 'good' : 'bad'}>{value}</strong>
    </div>
  )
}

/** The payoff of a release: what it did to the product, before the next plan. */
export function ReleaseCardDialog({ productId }: { productId: number }) {
  const store = useStore()
  const state = useGame()
  const product = state.products.find((p) => p.id === productId)
  const note = product?.releases?.at(-1)
  if (!product || !note) return null
  const reach = note.reachBefore > 0 ? Math.round((note.reachAfter / note.reachBefore - 1) * 100) : 0
  const fit = Math.round(note.fitAfter - note.fitBefore)
  const quality = Math.round(note.qualityAfter - note.qualityBefore)

  return (
    <Modal title={`${product.name} ${note.version}${note.title ? `: ${note.title}` : ''}`} onClose={() => store.closeDialog()}>
      <div className="release-rows">
        <Row label="People it can reach" value={`${signed(reach)}%`} good={reach >= 0} />
        <Row label="Fit" value={`${Math.round(note.fitBefore)} → ${Math.round(note.fitAfter)} (${signed(fit)})`} good={fit >= 0} />
        <Row label="Quality" value={`${Math.round(note.qualityBefore)} → ${Math.round(note.qualityAfter)}`} good={quality >= 0} />
        <Row label="Bugs it shipped with" value={`${Math.round(note.bugsShipped)}`} good={note.bugsShipped < 5} />
      </div>
      <p className="muted">New users arrive over the coming weeks.</p>
      <div className="actions">
        <button className="primary" onClick={() => store.closeDialog()}>
          Continue
        </button>
      </div>
    </Modal>
  )
}
