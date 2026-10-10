import type { ReactNode } from 'react'

type ConfirmDialogProps = {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  isBusy?: boolean
  children?: ReactNode
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDialog({ open, title, description, confirmLabel, isBusy, children, onCancel, onConfirm }: ConfirmDialogProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-overlay)] p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description" className="ui-card w-full max-w-lg rounded-2xl p-6">
        <h2 id="confirm-title" className="text-xl font-extrabold text-[var(--color-primary)]">{title}</h2>
        <p id="confirm-description" className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{description}</p>
        {children && <div className="mt-4">{children}</div>}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} disabled={isBusy} className="ui-button-secondary">Voltar</button>
          <button type="button" onClick={onConfirm} disabled={isBusy} className="ui-button-danger">{isBusy ? 'Processando…' : confirmLabel}</button>
        </div>
      </section>
    </div>
  )
}
