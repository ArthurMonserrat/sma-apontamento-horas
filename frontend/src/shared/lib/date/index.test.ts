import { describe, expect, it } from 'vitest'
import {
  compareIsoDates,
  eachIsoDate,
  getCorporateToday,
  getDaysUntilMonthClosing,
  getMonthClosingDate,
  getMonthRange,
  isIsoDate,
  isWeekend,
} from './index'

describe('prazos de fechamento', () => {
  it('calcula o último dia do mês e os dias restantes', () => {
    expect(getMonthClosingDate('2026-07-19')).toBe('2026-07-31')
    expect(getDaysUntilMonthClosing('2026-07-24')).toBe(7)
    expect(getDaysUntilMonthClosing('2026-07-30')).toBe(1)
  })
})

describe('datas civis no fuso corporativo', () => {
  it('obtém o dia em São Paulo sem depender do fuso do navegador', () => {
    const instant = new Date('2026-07-20T02:30:00.000Z')
    expect(getCorporateToday(instant)).toBe('2026-07-19')
  })

  it('valida datas reais e rejeita datas inexistentes', () => {
    expect(isIsoDate('2026-02-28')).toBe(true)
    expect(isIsoDate('2026-02-30')).toBe(false)
  })

  it('compara datas civis sem converter para timezone local', () => {
    expect(compareIsoDates('2026-07-19', '2026-07-20')).toBeLessThan(0)
    expect(compareIsoDates('2026-07-20', '2026-07-20')).toBe(0)
  })

  it('gera todos os dias de um intervalo inclusive', () => {
    expect(eachIsoDate('2026-07-30', '2026-08-02')).toEqual([
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
    ])
  })

  it('retorna início e fim do mês e identifica fim de semana', () => {
    expect(getMonthRange('2026-02')).toEqual({ startDate: '2026-02-01', endDate: '2026-02-28' })
    expect(isWeekend('2026-07-18')).toBe(true)
    expect(isWeekend('2026-07-20')).toBe(false)
  })
})
