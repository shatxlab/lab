import { createContext, useContext, useSyncExternalStore } from 'react'
import { getOffice } from '@/lib/tycoon/sim/offices'
import type { Signal } from '@/lib/tycoon/signals'
import type { Store } from '@/lib/tycoon/store'
import type { GameState, Office } from '@/lib/tycoon/sim/types'

export const StoreContext = createContext<Store | null>(null)

export function useStore(): Store {
  const store = useContext(StoreContext)
  if (!store) throw new Error('StoreContext is missing')
  return store
}

/** Subscribes to a signal and returns its value; the component re-renders whenever it changes. */
export function useSignal<T>(signal: Signal<T>): T {
  return useSyncExternalStore(signal.subscribe, () => signal.value)
}

/** The live game state; the calling component re-renders whenever the store changes. */
export function useGame(): GameState {
  const store = useStore()
  useSignal(store.version)
  return store.state
}

/** The office on screen (or `officeId` if given), falling back to the first. */
export function useOffice(officeId?: number): Office {
  const store = useStore()
  const state = useGame()
  // The hook call is unconditional: `officeId ?? useSignal(...)` inside the argument would
  // short-circuit and break the rules of hooks (callers mix both forms).
  const selectedOffice = useSignal(store.selectedOffice)
  return getOffice(state, officeId ?? selectedOffice) ?? state.offices[0]
}
