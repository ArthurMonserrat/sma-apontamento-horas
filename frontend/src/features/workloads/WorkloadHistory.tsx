import { formatDatePtBr } from '../../shared/lib/date'
import { formatMinutes } from '../time-entries/domain'
import type { WorkloadChangeRequest, WorkloadVersion } from './types'
import { StatusBadge } from '../../shared/ui/StatusBadge'
import { workloadRequestStatusPresentation } from '../status/presentation'

type WorkloadHistoryProps = {
  versions: WorkloadVersion[]
  requests: WorkloadChangeRequest[]
}

export function WorkloadHistory({ versions, requests }: WorkloadHistoryProps) {
  return (
    <section className="grid gap-6 xl:grid-cols-2" aria-label="Cargas e solicitações">
      <div className="rounded-2xl border ui-border p-5">
        <h2 className="text-lg font-extrabold ui-heading">Histórico de cargas</h2>
        {versions.length === 0 ? <p className="mt-3 text-sm ui-text-muted">Nenhuma carga cadastrada.</p> : (
          <ul className="mt-4 space-y-3">
            {[...versions].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)).map((version) => (
              <li key={version.id} className="rounded-xl ui-surface-subtle p-4">
                <strong className="ui-heading">{formatMinutes(version.dailyMinutes)} por dia</strong>
                <p className="mt-1 text-sm ui-text-muted">Vigente desde {formatDatePtBr(version.effectiveFrom)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rounded-2xl border ui-border p-5">
        <h2 className="text-lg font-extrabold ui-heading">Solicitações de alteração</h2>
        {requests.length === 0 ? <p className="mt-3 text-sm ui-text-muted">Nenhuma solicitação enviada.</p> : (
          <ul className="mt-4 space-y-3">
            {requests.map((request) => {
              const statusPresentation = workloadRequestStatusPresentation[request.status]
              return <li key={request.id} className="rounded-xl ui-surface-subtle p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="ui-heading">{formatMinutes(request.requestedDailyMinutes)} por dia</strong>
                  <StatusBadge tone={statusPresentation.tone}>{statusPresentation.label}</StatusBadge>
                </div>
                <p className="mt-2 text-sm ui-text-muted">Início pretendido: {formatDatePtBr(request.requestedEffectiveFrom)}</p>
                <p className="mt-1 text-sm ui-text-muted">Justificativa: {request.justification}</p>
                {request.rejectionReason && <p className="mt-2 text-sm font-semibold ui-text-danger">Motivo: {request.rejectionReason}</p>}
              </li>
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
