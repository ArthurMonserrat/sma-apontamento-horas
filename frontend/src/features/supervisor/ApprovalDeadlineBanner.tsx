import { getDaysUntilMonthClosing } from '../../shared/lib/date'

type ApprovalDeadlineBannerProps = {
  pendingCount: number
  today?: string
}

export function ApprovalDeadlineBanner({ pendingCount, today }: ApprovalDeadlineBannerProps) {
  if (pendingCount === 0) return null
  const daysRemaining = getDaysUntilMonthClosing(today)
  if (![7, 3, 2, 1, 0].includes(daysRemaining)) return null

  if (daysRemaining <= 1) {
    return <div role="alert" className="rounded-2xl border border-[var(--color-danger)] bg-[var(--color-surface)] p-4 text-sm font-semibold text-[var(--color-danger)]">O prazo de aprovação terminou. {pendingCount} pendência(s) foram transferidas para a Diretoria.</div>
  }

  if (daysRemaining === 7) {
    return <div role="status" className="rounded-2xl border border-[#8AB7C7]/50 bg-[#8AB7C7]/10 p-4 text-sm font-semibold text-[var(--color-text)]">Falta 1 semana para o fechamento. Você possui apontamentos pendentes na sua equipe.</div>
  }

  return <div role="alert" className="rounded-2xl border border-[#C9A66B]/60 bg-[#C9A66B]/10 p-4 text-sm font-semibold text-[var(--color-text)]">Atenção: O fechamento é em {daysRemaining} dias. Aprove as pendências para evitar o escalonamento automático.</div>
}
