import { describe, expect, it } from 'vitest'
import { DemoHolidayProvider } from './holidayProvider'

const location = { countryCode: 'BR' as const, stateCode: 'SP', city: 'São Paulo', timeZone: 'America/Sao_Paulo' }

describe('DemoHolidayProvider', () => {
  it('retorna somente fixtures determinísticas da localidade e do intervalo', async () => {
    const provider = new DemoHolidayProvider()
    const holidays = await provider.list(location, '2026-07-01', '2026-07-31')
    expect(holidays).toEqual([
      expect.objectContaining({ date: '2026-07-09', name: 'Revolução Constitucionalista', scope: 'STATE', source: 'DEMO' }),
    ])
  })

  it('não inventa feriado municipal para outra cidade', async () => {
    const provider = new DemoHolidayProvider()
    const otherCity = { ...location, city: 'Campinas' }
    const holidays = await provider.list(otherCity, '2026-01-01', '2026-12-31')
    expect(holidays.every((holiday) => holiday.scope !== 'CITY')).toBe(true)
  })
})
