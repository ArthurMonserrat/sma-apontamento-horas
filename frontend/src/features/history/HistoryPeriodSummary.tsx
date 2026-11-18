import { formatDatePtBr } from '../../shared/lib/date'
import type { CalendarEvent, PeriodSummary } from '../calendar/types'
import { formatMinutes, formatSignedMinutes } from '../time-entries/domain'

const eventLabels: Record<CalendarEvent['type'], string> = {
  HOLIDAY: 'Feriado', VACATION: 'Férias', MEDICAL_LEAVE_FULL: 'Afastamento integral', MEDICAL_LEAVE_PARTIAL: 'Afastamento parcial',
}

export function HistoryPeriodSummary({ summary, events }: { summary: PeriodSummary; events: CalendarEvent[] }) {
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
        {events.length === 0 ? <p className="mt-2 text-sm ui-text-muted">Nenhum evento encontrado no período.</p> : (
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {events.map((event) => <li key={event.id} className="rounded-xl ui-surface-subtle p-3 text-sm"><strong>{eventLabels[event.type]}:</strong> {event.title} · {formatDatePtBr(event.startDate)}{event.endDate !== event.startDate ? ` a ${formatDatePtBr(event.endDate)}` : ''}</li>)}
          </ul>
        )}
      </div>
    </section>
  )
}
