import { useContext, useSyncExternalStore } from 'react'
import { StoreContext } from './context'
import { useCareer } from './career-context'
const noSubscribe = () => () => {}
export function CareerFeedback({ inModal = false }: { inModal?: boolean }) {
  const career = useCareer(), store = useContext(StoreContext)
  const dialog = useSyncExternalStore(store?.dialog.subscribe ?? noSubscribe, () => store?.dialog.value ?? null, () => null)
  if ((!inModal && dialog) || !career || (!career.busy.value && !career.error.value)) return null
  return <div className="career-feedback" role={career.error.value ? 'alert' : 'status'}>
    {career.error.value ? <><p>{career.error.value}</p><button disabled={career.busy.value} onClick={() => void career.flush()}>Retry save</button><button disabled={career.busy.value} onClick={() => location.reload()}>Reload saved career</button></> : <p>Saving career… no financial changes are published until storage succeeds.</p>}
  </div>
}
