import { resolveEntryDateBlock, type EntryDateBlock } from '../../calendar/entryDatePolicy'
import type { CalendarEvent } from '../../calendar/types'
import { calendarEventService } from '../../../services/calendarEventService'
import { holidayProvider } from '../../../services/holidayProvider'
import { profileService } from '../../profile/infrastructure/profileService'

export interface EntryDateAvailabilityService {
  getBlock(collaboratorId: string, date: string): Promise<EntryDateBlock>
}

export const entryDateAvailabilityService: EntryDateAvailabilityService = {
  async getBlock(collaboratorId, date) {
    const profile = await profileService.getById(collaboratorId)
    if (!profile) throw new Error('Perfil profissional não encontrado.')
    const [events, holidays] = await Promise.all([
      calendarEventService.listByRange(collaboratorId, date, date),
      holidayProvider.list(profile.location, date, date),
    ])
    const holidayEvents: CalendarEvent[] = holidays.map((holiday) => ({
      id: holiday.id,
      collaboratorId,
      type: 'HOLIDAY',
      startDate: holiday.date,
      endDate: holiday.date,
      title: holiday.name,
      source: holiday.source === 'DEMO' ? 'DEMO' : 'COMPANY',
      createdAt: `${holiday.date}T12:00:00.000Z`,
    }))
    return resolveEntryDateBlock(date, [...events, ...holidayEvents])
  },
}
