import type { ReactNode } from 'react'

export default function Modal({
  title,
  children,
  actions,
  onClose,
}: {
  title: string
  children?: ReactNode
  actions: ReactNode
  onClose?: () => void
}) {
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div className="modal">
        <h2>{title}</h2>
        {children}
        <div className="modal-actions">{actions}</div>
      </div>
    </div>
  )
}
