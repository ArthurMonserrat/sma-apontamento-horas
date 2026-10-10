import type { DayApproval } from '../approvals/types'
import type { CalendarEvent, DailySummary } from './types'
import { formatDatePtBr } from '../../shared/lib/date'
import { formatMinutes, formatSignedMinutes } from '../time-entries/domain'
import type { TimeOffRequest } from '../time-off/types'
import { CalendarStateBadge } from './CalendarStateBadge'
import { StatusBadge } from '../../components/StatusBadge'
import { approvalStatusPresentation, nonApplicableApprovalPresentation } from '../status/presentation'

const eventLabels: Record<CalendarEvent['type'], string> = {
  HOLIDAY: 'Feriado', VACATION: 'Férias', MEDICAL_LEAVE_FULL: 'Afastamento integral', MEDICAL_LEAVE_PARTIAL: 'Afastamento parcial',
}

export function DayDetails({ summary, events, approval, timeOffRequests = [] }: { summary: DailySummary; events: CalendarEvent[]; approval: DayApproval | null; timeOffRequests?: TimeOffRequest[] }) {
  const approvalPresentation = approval ? approvalStatusPresentation[approval.status] : nonApplicableApprovalPresentation
  return (
    <section className="rounded-2xl border ui-border ui-surface p-5 shadow-sm" aria-labelledby="day-details-title">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-wider ui-accent">Detalhes do dia</p><h2 id="day-details-title" className="mt-1 text-lg font-extrabold ui-heading">{formatDatePtBr(summary.date)}</h2></div>
        <div className="flex flex-wrap items-center gap-2">
          <CalendarStateBadge state={summary.visualState} />
          <StatusBadge tone={approvalPresentation.tone} size="regular">{approvalPresentation.label}</StatusBadge>
        </div>
      </div>
      <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Apontado', formatMinutes(summary.workedMinutes)], ['Jornada esperada', formatMinutes(summary.expectedMinutes)],
          ['Horas justificadas', formatMinutes(summary.justifiedMinutes)], ['Saldo do dia', formatSignedMinutes(summary.balanceMinutes)],
        ].map(([label, value]) => <div key={label} className="rounded-xl ui-surface-subtle p-3"><dt className="text-xs font-bold uppercase ui-text-subtle">{label}</dt><dd className="mt-1 font-extrabold ui-heading">{value}</dd></div>)}
      </dl>
      {summary.hasIntegralEventConflict && <p role="alert" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"><strong>Conflito com evento integral:</strong> o apontamento foi preservado para auditoria, não participa do saldo e permanece somente leitura até futura resolução pela supervisão.</p>}
      {events.length > 0 && <div className="mt-4"><h3 className="text-sm font-bold ui-text">Eventos do dia</h3><ul className="mt-2 space-y-2">{events.map((event) => <li key={event.id} className="rounded-xl border ui-border p-3 text-sm"><strong>{eventLabels[event.type]}:</strong> {event.title}{event.justifiedMinutes ? ` · ${formatMinutes(event.justifiedMinutes)} justificadas` : ''}</li>)}</ul></div>}
      {timeOffRequests.length > 0 && <div className="mt-4"><h3 className="text-sm font-bold ui-text">Ausência</h3>{timeOffRequests.map((request) => <p key={request.id} className="mt-2 rounded-xl border ui-border ui-surface-subtle p-3 text-sm"><strong>{request.status === 'APPROVED' ? `${request.absenceType ?? 'Ausência'} confirmada` : `Solicitação de ${request.absenceType ?? 'ausência'}`}:</strong> {request.reason}</p>)}</div>}
      {approval?.correctionReason && <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"><strong>Correção solicitada:</strong> {approval.correctionReason}</p>}
      {approval?.deficitJustification && <p className="mt-4 text-sm ui-text-muted"><strong>Justificativa da aprovação com déficit:</strong> {approval.deficitJustification}</p>}
    </section>
  )
}
