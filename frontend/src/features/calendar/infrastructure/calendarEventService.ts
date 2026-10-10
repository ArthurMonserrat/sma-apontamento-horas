import type { CalendarEvent } from '../types'

export interface CalendarEventService {
  listByRange(collaboratorId: string, startDate: string, endDate: string): Promise<CalendarEvent[]>
}

const demoEvents: CalendarEvent[] = [
  {
    id: 'vacation-demo-july', collaboratorId: 'demo-collaborator-001', type: 'VACATION',
    startDate: '2026-07-06', endDate: '2026-07-10', title: 'Férias corporativas', source: 'DEMO',
    recordedBy: 'supervisor-demo-001', createdAt: '2026-06-15T12:00:00.000Z',
  },
  {
    id: 'medical-partial-demo', collaboratorId: 'demo-collaborator-001', type: 'MEDICAL_LEAVE_PARTIAL',
    startDate: '2026-07-14', endDate: '2026-07-14', justifiedMinutes: 180, title: 'Afastamento parcial corporativo', source: 'DEMO',
    recordedBy: 'supervisor-demo-001', createdAt: '2026-07-14T12:00:00.000Z',
  },
  {
    id: 'medical-full-demo', collaboratorId: 'demo-collaborator-001', type: 'MEDICAL_LEAVE_FULL',
    startDate: '2026-07-16', endDate: '2026-07-16', title: 'Afastamento integral corporativo', source: 'DEMO',
    recordedBy: 'supervisor-demo-001', createdAt: '2026-07-16T12:00:00.000Z',
  },
]

export class DemoCalendarEventService implements CalendarEventService {
  async listByRange(collaboratorId: string, startDate: string, endDate: string) {
    return demoEvents.filter((event) =>
      event.collaboratorId === collaboratorId && event.endDate >= startDate && event.startDate <= endDate)
  }
}

export const calendarEventService: CalendarEventService = new DemoCalendarEventService()
