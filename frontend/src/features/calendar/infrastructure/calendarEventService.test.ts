import { describe, expect, it } from 'vitest'
import { DemoCalendarEventService } from './calendarEventService'

describe('DemoCalendarEventService', () => {
  it('retorna apenas eventos do colaborador e do intervalo solicitado', async () => {
    const service = new DemoCalendarEventService()
    const events = await service.listByRange('demo-collaborator-001', '2026-07-01', '2026-07-31')
    expect(events.map((event) => event.type)).toEqual(['VACATION', 'MEDICAL_LEAVE_PARTIAL', 'MEDICAL_LEAVE_FULL'])
    expect(events.every((event) => event.collaboratorId === 'demo-collaborator-001')).toBe(true)
  })

  it('não expõe eventos a outro colaborador', async () => {
    await expect(new DemoCalendarEventService().listByRange('other', '2026-01-01', '2026-12-31')).resolves.toEqual([])
  })
})
