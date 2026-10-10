import { formatMinutes } from '../time-entries/domain'
import { formatDatePtBr } from '../../shared/lib/date'
import { getMonthGridCells, shiftMonth } from './domain'
import type { DailySummary } from './types'
import { CalendarLegend } from './CalendarLegend'
import { calendarStatePresentation } from './presentation'

type MonthlyCalendarProps = {
  monthKey: string
  selectedDate: string
  days: DailySummary[]
  onMonthChange: (monthKey: string) => void
  onSelectDate: (date: string) => void
  onOpenDate?: (date: string, hasEntries: boolean) => void
  managerDayLabels?: Record<string, string>
  onOpenManagerDay?: (date: string) => void
}

const weekdayLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1, 12)))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function MonthlyCalendar({ monthKey, selectedDate, days, onMonthChange, onSelectDate, onOpenDate, managerDayLabels, onOpenManagerDay }: MonthlyCalendarProps) {
  const summaries = new Map(days.map((day) => [day.date, day]))
  const gridCells = getMonthGridCells(monthKey)

  return (
    <section className="tour-calendario rounded-2xl border ui-border ui-surface p-4 shadow-sm sm:p-5" aria-labelledby="calendar-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" aria-label="Mês anterior" onClick={() => onMonthChange(shiftMonth(monthKey, -1))} className="rounded-xl border ui-border px-3 py-2 font-bold">‹</button>
        <div className="text-center">
          <h2 id="calendar-title" className="text-lg font-extrabold ui-heading">{monthLabel(monthKey)}</h2>
          <input type="month" value={monthKey} onChange={(event) => onMonthChange(event.target.value)} aria-label="Selecionar mês do calendário" className="mt-1 rounded-lg border ui-border ui-surface px-2 py-1 text-xs ui-text" />
        </div>
        <button type="button" aria-label="Próximo mês" onClick={() => onMonthChange(shiftMonth(monthKey, 1))} className="rounded-xl border ui-border px-3 py-2 font-bold">›</button>
      </div>
      <div className="mt-5 grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase tracking-wider ui-text-subtle sm:gap-2">
        {weekdayLabels.map((label) => <span key={label}>{label}</span>)}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1 sm:gap-2">
        {gridCells.map((cell) => {
          if (cell.kind === 'placeholder') {
            return <span key={cell.key} data-calendar-placeholder aria-hidden="true" className="min-h-20 rounded-xl border border-dashed ui-border ui-surface-subtle sm:min-h-24" />
          }
          const { date } = cell
          const summary = summaries.get(date)
          const state = summary?.visualState ?? 'NO_SCHEDULE'
          const presentation = calendarStatePresentation[state]
          const worked = formatMinutes(summary?.workedMinutes ?? 0)
          const expected = formatMinutes(summary?.expectedMinutes ?? 0)
          const managerDayLabel = managerDayLabels?.[date]
          const ariaLabel = `${formatDatePtBr(date)}: ${presentation.label}; ${worked} apontadas de ${expected} previstas${managerDayLabel ? `; ${managerDayLabel}` : ''}`
          return (
            <button
              key={cell.key}
              type="button"
              data-calendar-day={date}
              data-calendar-state={state}
              onClick={() => {
                onSelectDate(date)
                if (managerDayLabel) onOpenManagerDay?.(date)
              }}
              onDoubleClick={() => onOpenDate?.(date, (summary?.workedMinutes ?? 0) > 0)}
              aria-label={ariaLabel}
              aria-pressed={selectedDate === date}
              title={ariaLabel}
              className={`calendar-state calendar-state--${presentation.tone} min-h-20 rounded-xl border border-l-4 p-1.5 text-left transition hover:-translate-y-0.5 sm:min-h-24 sm:p-2 ${selectedDate === date ? 'calendar-day--selected' : ''}`}
            >
              <span className="block text-xs font-extrabold sm:text-sm">{Number(date.slice(-2))}</span>
              <span className="mt-1 block text-[10px] font-bold leading-tight">
                <span data-calendar-marker aria-hidden="true">{presentation.marker}</span>{' '}
                <span className="sr-only sm:not-sr-only">{presentation.label}</span>
              </span>
              <span className="mt-1 block text-[9px] font-semibold sm:text-[10px]">{worked}/{expected}</span>
              {managerDayLabel && <span className="mt-1 block truncate text-[9px] font-bold leading-tight text-[var(--color-primary)] sm:text-[10px]">{managerDayLabel}</span>}
            </button>
          )
        })}
      </div>
      <div className="mt-5"><CalendarLegend /></div>
      <p role="note" className="mt-3 rounded-lg ui-surface-subtle px-3 py-2 text-xs leading-5 ui-text-muted">Calendário corporativo: os feriados nacionais, estaduais e municipais ainda não estão integrados a uma fonte oficial.</p>
    </section>
  )
}
