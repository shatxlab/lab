import type { ReactNode } from 'react'
import { useEffect } from 'react'

interface ModalProps {
  title: string
  children: ReactNode
  /** Omit to make the dialog impossible to dismiss without choosing an action. */
  onClose?: () => void
}

export function Modal({ title, children, onClose }: ModalProps) {
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
        {children}
      </div>
    </div>
  )
}
