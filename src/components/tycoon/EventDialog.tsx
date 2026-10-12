import { describePendingEvent } from '@/lib/tycoon/sim/events'
import { useGame, useStore } from './context'
import { Modal } from './Modal'

/** A random event. There is no close button: the player has to pick something. */
export function EventDialog() {
  const store = useStore()
  const state = useGame()
  const view = describePendingEvent(state)
  if (!view) return null

  return (
    <Modal title={view.title}>
      <p>{view.text}</p>
      <div className="event-choices">
        {view.choices.map((choice, index) => (
          <button
            key={choice.label}
            className="event-choice"
            disabled={choice.disabled !== undefined}
            onClick={() => store.resolveEvent(index)}
          >
            <strong>{choice.label}</strong>
            {(choice.detail || choice.disabled) && (
              <small className={choice.disabled ? 'bad' : 'muted'}>{choice.disabled ?? choice.detail}</small>
            )}
          </button>
        ))}
      </div>
    </Modal>
  )
}
