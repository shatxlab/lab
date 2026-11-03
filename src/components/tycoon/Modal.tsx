import type { ReactNode } from 'react'
import { useEffect } from 'react'

interface ModalProps {
  title: string
  children: ReactNode
  /** Stable dialog actions, outside either scroll axis of the body. */
  footer?: ReactNode
  /** Omit to make the dialog impossible to dismiss without choosing an action. */
  onClose?: () => void
}

export function Modal({ title, children, footer, onClose }: ModalProps) {
  useEffect(() => {
    if (!onClose) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="backdrop" onClick={(event) => event.target === event.currentTarget && onClose?.()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}
