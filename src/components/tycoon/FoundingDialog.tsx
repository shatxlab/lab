import { useState } from 'react'
import { BARISTA } from '@/lib/tycoon/data/events'
import { foundingBlocker, NAME_MAX, rollPersonName, rollStudioName, studioNameOf, you } from '@/lib/tycoon/sim/founding'
import { useGame, useStore } from './context'
import { Modal } from './Modal'

/** The start of a run: who you are and what the studio is called, each made up by the dice if you like. */
export function FoundingDialog() {
  const store = useStore()
  const state = useGame()
  const [yourName, setYourName] = useState(() => you(state)?.name ?? rollPersonName())
  const [studioName, setStudioName] = useState(() => studioNameOf(state))
  const [message, setMessage] = useState('')
  const friend = state.employees.find((e) => e.founder && e !== you(state))
  const blocker = foundingBlocker(state, yourName, studioName)

  const start = () => {
    const result = store.found(yourName, studioName)
    if (result.ok) store.closeDialog()
    else setMessage(result.reason)
  }

  return (
    <Modal title="A new studio">
      {(state.chapter ?? 1) > 1 && !friend ? (
        <p>
          Back at the corner table in the café, alone this time. {BARISTA} the barista keeps the coffee coming. Hire someone to build with you when you can.
        </p>
      ) : (state.chapter ?? 1) > 1 ? (
        <p>
          Back at the corner table in the café, with <strong>{friend?.name}</strong>. You know more than the first time. {BARISTA} the barista keeps the coffee coming.
        </p>
      ) : (
        <p>
          It starts at a corner table in a café: you, who can tell what people want, and your friend{' '}
          <strong>{friend?.name ?? 'a developer'}</strong>, who can build it. {BARISTA} the barista keeps the coffee coming.
        </p>
      )}
      <form
        className="founding"
        onSubmit={(event) => {
          event.preventDefault()
          if (!blocker) start()
        }}
      >
        <label className="founding-field">
          <span>Your name</span>
          <span className="founding-input">
            <input value={yourName} maxLength={NAME_MAX} autoComplete="off" onInput={(event) => setYourName(event.currentTarget.value)} />
            <button type="button" aria-label="Make up a name for you" title="Make one up" onClick={() => setYourName(rollPersonName())}>
              🎲
            </button>
          </span>
        </label>
        <label className="founding-field">
          <span>The studio</span>
          <span className="founding-input">
            <input value={studioName} maxLength={NAME_MAX} autoComplete="off" onInput={(event) => setStudioName(event.currentTarget.value)} />
            <button
              type="button"
              aria-label="Make up a name for the studio"
              title="Make one up"
              onClick={() => setStudioName(rollStudioName(state.rivals.map((r) => r.name)))}
            >
              🎲
            </button>
          </span>
        </label>
        <p className="muted">
          You are the studio's analyst: you study users and read the market. Take on small jobs for clients to pay for a
          garage, and room for two more people.
        </p>
        {(message || blocker) && <p className="bad">{message || blocker}</p>}
        <div className="actions">
          <button type="submit" className="primary" disabled={blocker !== null}>
            Open the laptops
          </button>
        </div>
      </form>
    </Modal>
  )
}
