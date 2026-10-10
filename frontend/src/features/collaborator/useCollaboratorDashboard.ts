import { useCallback, useEffect, useState } from 'react'
import { calculateDaySummary, calculatePeriodSummary } from '../calendar/domain'
import { isCountableTimeEntryStatus } from '../time-entries/domain'
import type { CalendarEvent, DailySummary, PeriodSummary } from '../calendar/types'
import type { DayApproval } from '../approvals/types'
import { isDayApprovalApplicable } from '../approvals/domain'
import type { TimeEntry } from '../time-entries/types'
import { buildAttentionSummary } from './domain'
import { calendarEventService } from '../../services/calendarEventService'
import { dayApprovalService } from '../approvals'
import { holidayProvider } from '../../services/holidayProvider'
import { timeEntryService } from '../time-entries'
import { timeOffService } from '../time-off/infrastructure/timeOffService'
import type { TimeOffRequest } from '../time-off/types'
import { requestAppliesToDate } from '../time-off/types'
import type { AssignmentSnapshot } from '../squads/types'
import type { WorkloadVersion } from '../workloads/types'
import { eachIsoDate, getCorporateToday, getMonthRange } from '../../shared/lib/date'
import { profileService } from '../profile/infrastructure/profileService'
import { workloadService } from '../workloads/infrastructure/workloadService'
import { useSession } from '../session/useSession'

type DashboardData = {
  monthSummary: PeriodSummary
  filteredSummary: PeriodSummary
  totalSummary: PeriodSummary
  todaySummary: DailySummary
  selectedSummary: DailySummary
  calendarDays: DailySummary[]
  selectedEntries: TimeEntry[]
  selectedEvents: CalendarEvent[]
  selectedApproval: DayApproval | null
  approvals: DayApproval[]
  selectedTimeOffRequests: TimeOffRequest[]
  pendingTimeOffRequests: number
  pendingWorkloadRequests: number
  assignment: AssignmentSnapshot | null
  currentWorkload: WorkloadVersion | null
  attention: ReturnType<typeof buildAttentionSummary>
}

type DashboardState = { data: DashboardData | null; isLoading: boolean; error: string | null }

function holidaysToEvents(collaboratorId: string, holidays: Awaited<ReturnType<typeof holidayProvider.list>>): CalendarEvent[] {
  return holidays.map((holiday) => ({
    id: holiday.id, collaboratorId, type: 'HOLIDAY', startDate: holiday.date, endDate: holiday.date,
    title: holiday.name, source: holiday.source === 'DEMO' ? 'DEMO' : 'COMPANY', createdAt: `${holiday.date}T12:00:00.000Z`,
  }))
}

export function useCollaboratorDashboard(selectedDate: string, monthKey: string, periodStart?: string, periodEnd?: string) {
  const { profile } = useSession()
  const [state, setState] = useState<DashboardState>({ data: null, isLoading: true, error: null })

  const load = useCallback(async () => {
    if (!profile) return
    setState((current) => ({ ...current, isLoading: true, error: null }))
    try {
      const today = getCorporateToday()
      const monthRange = getMonthRange(monthKey)
      const [professionalProfile, workloadVersions, workloadRequests] = await Promise.all([
        profileService.getById(profile.id),
        workloadService.listVersions(profile.id),
        workloadService.listRequests(profile.id),
      ])
      if (!professionalProfile) throw new Error('Perfil profissional não encontrado.')
      const totalStartDate = workloadVersions[0]?.effectiveFrom ?? today
      const [monthEntries, totalEntries, monthEvents, totalEvents, monthHolidays, totalHolidays, monthTimeOff, totalTimeOff] = await Promise.all([
        timeEntryService.listByRange(profile.id, monthRange.startDate, monthRange.endDate),
        timeEntryService.listByRange(profile.id, totalStartDate, today),
        calendarEventService.listByRange(profile.id, monthRange.startDate, monthRange.endDate),
        calendarEventService.listByRange(profile.id, totalStartDate, today),
        holidayProvider.list(professionalProfile.location, monthRange.startDate, monthRange.endDate),
        holidayProvider.list(professionalProfile.location, totalStartDate, today),
        timeOffService.listByRange(profile.id, monthRange.startDate, monthRange.endDate),
        timeOffService.listApprovedByRange(profile.id, totalStartDate, today),
      ])
      const monthAllEvents = [...monthEvents, ...holidaysToEvents(profile.id, monthHolidays)]
      const totalAllEvents = [...totalEvents, ...holidaysToEvents(profile.id, totalHolidays)]
      const monthSummary = calculatePeriodSummary({
        ...monthRange, today, collaboratorId: profile.id, entries: monthEntries, events: monthAllEvents,
        timeOffRequests: monthTimeOff, workloadVersions,
      })
      const totalSummary = calculatePeriodSummary({
        startDate: totalStartDate, endDate: today, today, collaboratorId: profile.id, entries: totalEntries, events: totalAllEvents,
        timeOffRequests: totalTimeOff, workloadVersions,
      })
      let filteredSummary = monthSummary
      if (periodStart && periodEnd) {
        if (periodStart > periodEnd) throw new Error('A data inicial do intervalo deve ser anterior à data final.')
        const [periodEntries, periodEvents, periodHolidays, periodTimeOff] = await Promise.all([
          timeEntryService.listByRange(profile.id, periodStart, periodEnd),
          calendarEventService.listByRange(profile.id, periodStart, periodEnd),
          holidayProvider.list(professionalProfile.location, periodStart, periodEnd),
          timeOffService.listByRange(profile.id, periodStart, periodEnd),
        ])
        filteredSummary = calculatePeriodSummary({
          startDate: periodStart, endDate: periodEnd, today, collaboratorId: profile.id, entries: periodEntries,
          events: [...periodEvents, ...holidaysToEvents(profile.id, periodHolidays)], timeOffRequests: periodTimeOff, workloadVersions,
        })
      }
      const selectedEntries = monthEntries.filter((entry) => entry.entryDate === selectedDate)
      const selectedEvents = monthAllEvents.filter((event) => event.startDate <= selectedDate && event.endDate >= selectedDate)
      const selectedTimeOffRequests = monthTimeOff.filter((request) => requestAppliesToDate(request, selectedDate) && request.status !== 'CANCELLED')
      const selectedSummary = monthSummary.days.find((day) => day.date === selectedDate) ?? calculateDaySummary({
        date: selectedDate, today, collaboratorId: profile.id, entries: selectedEntries, events: selectedEvents,
        timeOffRequests: monthTimeOff, workloadVersions,
      })
      const todaySummary = monthKey === today.slice(0, 7)
        ? monthSummary.days.find((day) => day.date === today) ?? selectedSummary
        : calculateDaySummary({ date: today, today, collaboratorId: profile.id, entries: totalEntries, events: totalAllEvents, timeOffRequests: totalTimeOff, workloadVersions })
      const currentAssignment = profileService.resolveAssignment(profile.id)
      const calendarDates = eachIsoDate(monthRange.startDate, monthRange.endDate)
      const approvals = (await Promise.all(calendarDates.flatMap((date) => {
        const summary = monthSummary.days.find((day) => day.date === date)
        if (!summary || !isDayApprovalApplicable(summary)) return []
        const entries = monthEntries.filter((entry) => entry.entryDate === date)
        return [dayApprovalService.getForDate(
          profile.id,
          date,
          entries.some((entry) => isCountableTimeEntryStatus(entry.status)),
          entries[0]?.assignmentSnapshot ?? currentAssignment,
          true,
        )]
      }))).filter((approval): approval is DayApproval => approval !== null)
      const selectedApproval = isDayApprovalApplicable(selectedSummary)
        ? approvals.find((approval) => approval.entryDate === selectedDate)
          ?? await dayApprovalService.getForDate(
            profile.id,
            selectedDate,
            selectedEntries.some((entry) => isCountableTimeEntryStatus(entry.status)),
            selectedEntries[0]?.assignmentSnapshot ?? currentAssignment,
            true,
          )
        : null
      setState({
        data: {
          monthSummary, filteredSummary, totalSummary, todaySummary, selectedSummary, calendarDays: monthSummary.days,
          selectedEntries, selectedEvents, selectedTimeOffRequests, selectedApproval, approvals,
          pendingTimeOffRequests: monthTimeOff.filter((request) => request.status === 'PENDING').length,
          pendingWorkloadRequests: workloadRequests.filter((request) => request.status === 'PENDING').length,
          assignment: currentAssignment,
          currentWorkload: await workloadService.getCurrent(profile.id, today),
          attention: buildAttentionSummary({ today, days: monthSummary.days, approvals }),
        },
        isLoading: false,
        error: null,
      })
    } catch (error) {
      setState({ data: null, isLoading: false, error: error instanceof Error ? error.message : 'Não foi possível carregar a visão geral.' })
    }
  }, [monthKey, periodEnd, periodStart, profile, selectedDate])

  useEffect(() => { void load() }, [load])
  return { ...state, reload: load }
}
