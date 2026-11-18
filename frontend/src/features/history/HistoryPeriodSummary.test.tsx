import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { PeriodSummary } from '../calendar/types'
import { HistoryPeriodSummary } from './HistoryPeriodSummary'

const summary: PeriodSummary = {
  startDate: '2026-07-01', endDate: '2026-07-31', expectedMinutes: 480, workedMinutes: 420,
  regularMinutes: 420, extraMinutes: 0, missingMinutes: 60, justifiedMinutes: 480,
  realBalanceMinutes: -60, hasFutureDates: true, days: [],
}

describe('resumo do período no histórico', () => {
  it('mostra somente saldo real, informa o corte futuro e preserva eventos administrativos', () => {
    const markup = renderToStaticMarkup(<HistoryPeriodSummary summary={summary} events={[{
      id: 'holiday-1', collaboratorId: 'collaborator-1', type: 'HOLIDAY', startDate: '2026-07-09', endDate: '2026-07-09',
      title: 'Feriado corporativo', source: 'DEMO', createdAt: '2026-07-01T12:00:00.000Z',
    }]} />)
    expect(markup).toContain('Saldo real do período')
    expect(markup).toContain('-01:00')
    expect(markup).not.toContain('Projeção futura')
    expect(markup).toContain('Datas futuras não são consideradas no saldo real.')
    expect(markup).toContain('Feriado corporativo')
    expect(markup).not.toContain('Ausência')
  })
})
