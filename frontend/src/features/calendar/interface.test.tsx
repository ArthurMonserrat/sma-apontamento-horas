import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { DailySummary } from './types'
import { CalendarLegend } from './CalendarLegend'
import { MonthlyCalendar } from './MonthlyCalendar'
import { DayDetails } from './DayDetails'
import type { DayApproval } from '../approvals/types'
import { calendarStatePresentation } from './presentation'

function day(date: string, visualState: DailySummary['visualState'], workedMinutes = 0, expectedMinutes = 480): DailySummary {
  return {
    date, baseExpectedMinutes: expectedMinutes, expectedMinutes, justifiedMinutes: 0, workedMinutes,
    regularMinutes: Math.min(workedMinutes, expectedMinutes), extraMinutes: Math.max(0, workedMinutes - expectedMinutes),
    missingMinutes: Math.max(0, expectedMinutes - workedMinutes), balanceMinutes: workedMinutes - expectedMinutes,
    isFuture: false, hasIntegralEventConflict: false, visualState,
  }
}

const approval: DayApproval = {
  id: 'approval-1', collaboratorId: 'demo-collaborator-001', entryDate: '2026-07-20', assignmentSnapshot: null,
  status: 'AVAILABLE_FOR_APPROVAL', version: 1, updatedAt: '2026-07-20T12:00:00.000Z',
}

const states: DailySummary['visualState'][] = [
  'NO_SCHEDULE', 'NO_ENTRY', 'INCOMPLETE', 'COMPLETE', 'EXCEEDED',
  'VACATION', 'MEDICAL_LEAVE', 'HOLIDAY',
]

const expectedPresentation = {
  NO_SCHEDULE: { label: 'Sem jornada prevista', marker: '○', tone: 'no-schedule' },
  NO_ENTRY: { label: 'Sem apontamento', marker: '!', tone: 'no-entry' },
  INCOMPLETE: { label: 'Jornada incompleta', marker: '◷', tone: 'incomplete' },
  COMPLETE: { label: 'Jornada atingida', marker: '✓', tone: 'complete' },
  EXCEEDED: { label: 'Jornada excedida', marker: '+', tone: 'exceeded' },
  VACATION: { label: 'Férias', marker: '▣', tone: 'vacation' },
  MEDICAL_LEAVE: { label: 'Afastamento', marker: '✚', tone: 'medical-leave' },
  HOLIDAY: { label: 'Feriado', marker: '◆', tone: 'holiday' },
}

describe('calendário acessível', () => {
  it('mantem o catalogo fechado de nove rotulos, simbolos e tons', () => {
    expect(calendarStatePresentation).toEqual(expectedPresentation)
  })

  it('renderiza legenda textual para todos os estados sem depender somente de cor', () => {
    const markup = renderToStaticMarkup(<CalendarLegend />)
    for (const state of states) {
      const { label, marker, tone } = expectedPresentation[state]
      expect(markup).toContain(`data-calendar-state="${state}"`)
      expect(markup).toContain(`calendar-state--${tone}`)
      expect(markup).toContain('calendar-state-dot')
      expect(markup).toContain('calendar-state-marker')
      expect(markup).toContain(label)
      expect(markup).toContain(marker)
    }
  })

  it('aplica o mesmo estado semantico no dia, legenda e detalhe', () => {
    for (const state of states) {
      const summary = day('2026-07-20', state)
      const calendar = renderToStaticMarkup(
        <MonthlyCalendar monthKey="2026-07" selectedDate={summary.date} days={[summary]} onMonthChange={vi.fn()} onSelectDate={vi.fn()} />,
      )
      const details = renderToStaticMarkup(<DayDetails summary={summary} events={[]} approval={approval} />)
      const tone = expectedPresentation[state].tone

      expect(calendar).toContain(`data-calendar-state="${state}"`)
      expect(calendar).toContain(`calendar-state--${tone}`)
      expect(details).toContain(`data-calendar-state="${state}"`)
      expect(details).toContain(`calendar-state--${tone}`)
      expect(details).toContain('data-status-tone="pending"')
    }
  })

  it('mantem simbolo visivel no mobile, rotulo acessivel e selecao sem sobrescrever o estado', () => {
    const markup = renderToStaticMarkup(
      <MonthlyCalendar monthKey="2026-07" selectedDate="2026-07-20" days={[day('2026-07-20', 'EXCEEDED', 540)]} onMonthChange={vi.fn()} onSelectDate={vi.fn()} />,
    )

    expect(markup).toContain('data-calendar-marker="true"')
    expect(markup).toContain('aria-hidden="true">+</span>')
    expect(markup).toContain('sr-only sm:not-sr-only')
    expect(markup).toContain('calendar-state--exceeded')
    expect(markup).toContain('calendar-day--selected')
    expect(markup).not.toContain('ring-sma-')
  })

  it('nomeia cada dia com data, situação e totais, sem codificar aprovação como cor', () => {
    const markup = renderToStaticMarkup(
      <MonthlyCalendar monthKey="2026-07" selectedDate="2026-07-20" days={[
        day('2026-07-20', 'COMPLETE', 480), day('2026-07-21', 'INCOMPLETE', 300),
      ]} onMonthChange={vi.fn()} onSelectDate={vi.fn()} />,
    )
    expect(markup).toContain('aria-label="20 de julho de 2026: Jornada atingida; 08:00 apontadas de 08:00 previstas"')
    expect(markup).toContain('Jornada incompleta')
    expect(markup).not.toContain('approval-color')
  })

  it('oferece navegação mensal com nomes acessíveis', () => {
    const markup = renderToStaticMarkup(<MonthlyCalendar monthKey="2026-07" selectedDate="2026-07-20" days={[]} onMonthChange={vi.fn()} onSelectDate={vi.fn()} />)
    expect(markup).toContain('aria-label="Mês anterior"')
    expect(markup).toContain('aria-label="Próximo mês"')
    expect(markup).toContain('aria-label="Selecionar mês do calendário"')
    expect(markup).toContain('Julho de 2026')
  })

  it('renderiza somente dias do mês e mantém placeholders fora do foco', () => {
    const markup = renderToStaticMarkup(<MonthlyCalendar monthKey="2026-07" selectedDate="2026-07-20" days={[]} onMonthChange={vi.fn()} onSelectDate={vi.fn()} />)

    expect(markup.match(/data-calendar-day=/g)).toHaveLength(31)
    expect(markup.match(/data-calendar-placeholder=/g)).toHaveLength(4)
    expect(markup).not.toContain('29 de junho de 2026')
    expect(markup).not.toContain('1 de agosto de 2026')
    expect(markup).toContain('data-calendar-placeholder="true" aria-hidden="true"')
  })

  it('explica que o calendário é corporativo sem expor termos técnicos', () => {
    const markup = renderToStaticMarkup(<MonthlyCalendar monthKey="2026-07" selectedDate="2026-07-20" days={[]} onMonthChange={vi.fn()} onSelectDate={vi.fn()} />)

    expect(markup).toContain('Calendário corporativo: os feriados nacionais, estaduais e municipais ainda não estão integrados a uma fonte oficial.')
    expect(markup).toContain('role="note"')
    expect(markup).not.toContain('HolidayProvider')
    expect(markup).not.toContain('provider corporativo')
  })

  it('sinaliza registro histórico conflitante com evento integral', () => {
    const summary = { ...day('2026-07-20', 'VACATION'), hasIntegralEventConflict: true }
    const markup = renderToStaticMarkup(<DayDetails summary={summary} events={[{
      id: 'vacation-1', collaboratorId: 'demo-collaborator-001', type: 'VACATION', startDate: '2026-07-20', endDate: '2026-07-20',
      title: 'Férias corporativas', source: 'DEMO', createdAt: '2026-07-01T12:00:00.000Z',
    }]} approval={approval} />)

    expect(markup).toContain('Conflito com evento integral')
    expect(markup).toContain('preservado para auditoria')
    expect(markup).toContain('role="alert"')
  })

  it('explicita quando a aprovação não se aplica ao dia', () => {
    const markup = renderToStaticMarkup(<DayDetails summary={day('2026-07-19', 'NO_SCHEDULE', 0, 0)} events={[]} approval={null} />)

    expect(markup).toContain('Aprovação não aplicável')
    expect(markup).toContain('data-status-tone="neutral"')
  })
})
