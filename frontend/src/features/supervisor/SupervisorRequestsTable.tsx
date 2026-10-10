import { StatusBadge } from '../../shared/ui/StatusBadge'
import { timeOffStatusPresentation } from '../status/presentation'
import type { SupervisorTimeOffRequest } from './types'

type SupervisorRequestsTableProps = {
  requests: SupervisorTimeOffRequest[]
  isMutating: boolean
  onApprove: (request: SupervisorTimeOffRequest) => void
  onReject: (request: SupervisorTimeOffRequest) => void
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${date}T00:00:00.000Z`))
}

function formatPeriod(request: SupervisorTimeOffRequest) {
  return request.startDate === request.endDate ? formatDate(request.startDate) : `${formatDate(request.startDate)} a ${formatDate(request.endDate)}`
}

export function SupervisorRequestsTable({ requests, isMutating, onApprove, onReject }: SupervisorRequestsTableProps) {
  const safeRequests = Array.isArray(requests) ? requests : []

  if (safeRequests.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
        <p className="font-bold text-[var(--color-text)]">Nenhum registro encontrado.</p>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">Os pedidos de ausencia da equipe aparecerao aqui.</p>
      </div>
    )
  }

  return (
    <section className="ui-card overflow-hidden rounded-2xl" aria-labelledby="supervisor-requests-title">
      <div className="flex flex-col gap-2 border-b border-[var(--color-border)] p-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="ui-eyebrow text-xs font-bold uppercase tracking-[0.16em]">Solicitacoes</p>
          <h2 id="supervisor-requests-title" className="mt-1 text-xl font-extrabold text-[var(--color-text)]">Solicitacoes de Ausencia</h2>
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">{safeRequests.length} solicitacao(oes)</p>
      </div>

      <div className="hidden max-h-[600px] overflow-auto md:block">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-[var(--color-surface-subtle)] text-xs uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
            <tr>
              <th scope="col" className="px-5 py-4">Colaborador</th>
              <th scope="col" className="px-5 py-4">Tipo</th>
              <th scope="col" className="px-5 py-4">Periodo</th>
              <th scope="col" className="px-5 py-4">Justificativa</th>
              <th scope="col" className="px-5 py-4">Status</th>
              <th scope="col" className="px-5 py-4 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody className="divide-y ui-divide">
            {safeRequests && safeRequests.length > 0 ? safeRequests.map((request) => {
              const status = timeOffStatusPresentation[request.status]
              const isPending = request.status === 'PENDING'
              return (
                <tr key={request.id} className="transition hover:bg-[var(--color-surface-subtle)]">
                  <td className="px-5 py-4 font-bold text-[var(--color-text)]">{request.collaboratorName}</td>
                  <td className="px-5 py-4 text-[var(--color-text-muted)]">{request.absenceType}</td>
                  <td className="px-5 py-4 text-[var(--color-text-muted)]">{formatPeriod(request)}</td>
                  <td className="px-5 py-4">
                    <p className="max-w-md text-[var(--color-text)]">{request.reason}</p>
                    {request.rejectionReason && <p className="mt-2 text-xs text-[var(--color-text-muted)]">Motivo: {request.rejectionReason}</p>}
                  </td>
                  <td className="px-5 py-4"><StatusBadge tone={status.tone}>{status.label}</StatusBadge></td>
                  <td className="px-5 py-4">
                    {isPending ? (
                      <div className="flex justify-end gap-2">
                        <button type="button" className="ui-button-secondary px-3 py-2" onClick={() => onReject(request)} disabled={isMutating}>
                          Rejeitar
                        </button>
                        <button type="button" className="ui-button-primary px-3 py-2" onClick={() => onApprove(request)} disabled={isMutating}>
                          Aprovar
                        </button>
                      </div>
                    ) : (
                      <p className="text-right text-xs font-bold text-[var(--color-text-muted)]">Concluido</p>
                    )}
                  </td>
                </tr>
              )
            }) : (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-sm text-[var(--color-text-muted)]">
                  Nenhum registro encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="max-h-[600px] divide-y overflow-y-auto ui-divide md:hidden">
        {safeRequests && safeRequests.length > 0 ? safeRequests.map((request) => {
          const status = timeOffStatusPresentation[request.status]
          const isPending = request.status === 'PENDING'
          return (
            <article key={request.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-extrabold text-[var(--color-text)]">{request.collaboratorName}</h3>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">{request.absenceType} - {formatPeriod(request)}</p>
                </div>
                <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
              </div>
              <p className="mt-4 text-sm text-[var(--color-text)]">{request.reason}</p>
              {request.rejectionReason && <p className="mt-2 text-xs text-[var(--color-text-muted)]">Motivo: {request.rejectionReason}</p>}
              {isPending && (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button type="button" className="ui-button-secondary" onClick={() => onReject(request)} disabled={isMutating}>
                    Rejeitar
                  </button>
                  <button type="button" className="ui-button-primary" onClick={() => onApprove(request)} disabled={isMutating}>
                    Aprovar
                  </button>
                </div>
              )}
            </article>
          )
        }) : <p className="p-5 text-sm text-[var(--color-text-muted)]">Nenhum registro encontrado.</p>}
      </div>
    </section>
  )
}
