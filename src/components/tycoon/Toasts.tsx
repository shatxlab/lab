import { useSignal, useStore } from './context'

/** News that fades on its own: market shifts, event outcomes. */
export function Toasts() {
  const toasts = useSignal(useStore().toasts)
  if (toasts.length === 0) return null
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast">
          {toast.text}
        </div>
      ))}
    </div>
  )
}
