import type { Holiday } from '../types'
import type { WorkLocation } from '../../profile/types'

export interface HolidayProvider {
  list(location: WorkLocation, startDate: string, endDate: string): Promise<Holiday[]>
}

const demoHolidays: Holiday[] = [
  { id: 'holiday-2026-new-year', date: '2026-01-01', name: 'Confraternização Universal', countryCode: 'BR', scope: 'NATIONAL', source: 'DEMO' },
  { id: 'holiday-2026-tiradentes', date: '2026-04-21', name: 'Tiradentes', countryCode: 'BR', scope: 'NATIONAL', source: 'DEMO' },
  { id: 'holiday-2026-labor', date: '2026-05-01', name: 'Dia Mundial do Trabalho', countryCode: 'BR', scope: 'NATIONAL', source: 'DEMO' },
  { id: 'holiday-2026-sp-revolution', date: '2026-07-09', name: 'Revolução Constitucionalista', countryCode: 'BR', stateCode: 'SP', scope: 'STATE', source: 'DEMO' },
  { id: 'holiday-2026-independence', date: '2026-09-07', name: 'Independência do Brasil', countryCode: 'BR', scope: 'NATIONAL', source: 'DEMO' },
  { id: 'holiday-2026-aparecida', date: '2026-10-12', name: 'Nossa Senhora Aparecida', countryCode: 'BR', scope: 'NATIONAL', source: 'DEMO' },
  { id: 'holiday-2026-finados', date: '2026-11-02', name: 'Finados', countryCode: 'BR', scope: 'NATIONAL', source: 'DEMO' },
  { id: 'holiday-2026-republic', date: '2026-11-15', name: 'Proclamação da República', countryCode: 'BR', scope: 'NATIONAL', source: 'DEMO' },
  { id: 'holiday-2026-black-awareness', date: '2026-11-20', name: 'Dia Nacional de Zumbi e da Consciência Negra', countryCode: 'BR', scope: 'NATIONAL', source: 'DEMO' },
  { id: 'holiday-2026-christmas', date: '2026-12-25', name: 'Natal', countryCode: 'BR', scope: 'NATIONAL', source: 'DEMO' },
]

export class DemoHolidayProvider implements HolidayProvider {
  async list(location: WorkLocation, startDate: string, endDate: string) {
    return demoHolidays.filter((holiday) => {
      if (holiday.date < startDate || holiday.date > endDate || holiday.countryCode !== location.countryCode) return false
      if (holiday.scope === 'STATE' && holiday.stateCode !== location.stateCode) return false
      if (holiday.scope === 'CITY' && holiday.city !== location.city) return false
      return true
    })
  }
}

export const holidayProvider: HolidayProvider = new DemoHolidayProvider()
