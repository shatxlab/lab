import { createContext, useContext, useSyncExternalStore } from 'react'
import type { CareerController } from '@/lib/tycoon/career-controller'
export const CareerContext = createContext<CareerController | null>(null)
const noSubscribe = () => () => {}
/** Optional while v11 remains live. A controller is installed only by the complete career bootstrap. */
export function useCareer() {
  const career = useContext(CareerContext)
  useSyncExternalStore(career?.version.subscribe ?? noSubscribe, () => career?.version.value ?? 0, () => 0)
  return career
}
