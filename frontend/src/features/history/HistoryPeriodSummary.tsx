import { formatDatePtBr } from '../../shared/lib/date'
import type { CalendarEvent, PeriodSummary } from '../calendar/types'
import type { TimeOffRequest } from '../time-off/types'
import { formatMinutes, formatSignedMinutes } from '../time-entries/domain'

const eventLabels: Record<CalendarEvent['type'], string> = {
  HOLIDAY: 'Feriado', VACATION: 'Férias', MEDICAL_LEAVE_FULL: 'Afastamento integral', MEDICAL_LEAVE_PARTIAL: 'Afastamento parcial',
}

function formatAbsencePeriod(request: TimeOffRequest) {
  const startDate = request.startDate ?? request.date
  const endDate = request.endDate ?? request.date
  return startDate === endDate ? formatDatePtBr(startDate) : `${formatDatePtBr(startDate)} a ${formatDatePtBr(endDate)}`
}

function absenceStatusLabel(request: TimeOffRequest) {
  const type = request.absenceType ?? 'Ausência'
  if (request.status === 'APPROVED') return `${type} aprovada`
  if (request.status === 'PENDING') return `${type} pendente`
  return `${type} rejeitada`
}

export function HistoryPeriodSummary({ summary, events, timeOffRequests }: { summary: PeriodSummary; events: CalendarEvent[]; timeOffRequests: TimeOffRequest[] }) {
  const visibleTimeOff = timeOffRequests.filter((request) => request.status !== 'CANCELLED')
  return (
    <section className="space-y-4" aria-labelledby="history-period-title">
      <h2 id="history-period-title" className="sr-only">Resumo do período consultado</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <article className="rounded-2xl border ui-border ui-surface p-4"><p className="text-sm font-bold ui-text-subtle">Saldo real do período</p><p className="mt-2 text-2xl font-extrabold ui-heading">{formatSignedMinutes(summary.realBalanceMinutes)}</p></article>
        <article className="rounded-2xl border ui-border ui-surface p-4"><p className="text-sm font-bold ui-text-subtle">Jornada ajustada</p><p className="mt-2 text-2xl font-extrabold ui-heading">{formatMinutes(summary.expectedMinutes)}</p></article>
        <article className="rounded-2xl border ui-border ui-surface p-4"><p className="text-sm font-bold ui-text-subtle">Horas apontadas</p><p className="mt-2 text-2xl font-extrabold ui-heading">{formatMinutes(summary.workedMinutes)}</p></article>
      </div>
      {summary.hasFutureDates && <p role="note" className="text-xs ui-text-subtle">Datas futuras não são consideradas no saldo real.</p>}
      <div className="rounded-2xl border ui-border ui-surface p-5">
        <h3 className="font-extrabold ui-heading">Eventos do período</h3>
        {events.length === 0 && visibleTimeOff.length === 0 ? <p className="mt-2 text-sm ui-text-muted">Nenhum evento encontrado no período.</p> : (
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {events.map((event) => <li key={event.id} className="rounded-xl ui-surface-subtle p-3 text-sm"><strong>{eventLabels[event.type]}:</strong> {event.title} · {formatDatePtBr(event.startDate)}{event.endDate !== event.startDate ? ` a ${formatDatePtBr(event.endDate)}` : ''}</li>)}
            {visibleTimeOff.map((request) => <li key={request.id} className="rounded-xl ui-surface-subtle p-3 text-sm"><strong>{absenceStatusLabel(request)}:</strong> {formatAbsencePeriod(request)} · {request.reason}</li>)}
          </ul>
        )}
      </div>
    </section>
  )
}
