import { compareIsoDates, eachIsoDate } from '../../shared/lib/date'
import type { TimeEntry } from '../time-entries/types'
import type { TimeOffRequest } from '../time-off/types'
import { requestAppliesToDate } from '../time-off/types'
import { getBaseExpectedMinutes } from '../workloads/domain'
import type { WorkloadVersion } from '../workloads/types'
import { isCountableTimeEntryStatus } from '../time-entries/domain'
import type { CalendarEvent, CalendarVisualState, DailySummary, PeriodSummary } from './types'
import { calendarStatePresentation } from './presentation'

type DaySummaryInput = {
  date: string
  today: string
  collaboratorId: string
  entries: TimeEntry[]
  events: CalendarEvent[]
  timeOffRequests: TimeOffRequest[]
  workloadVersions: WorkloadVersion[]
}

function eventApplies(event: CalendarEvent, collaboratorId: string, date: string) {
  return event.collaboratorId === collaboratorId && event.startDate <= date && event.endDate >= date
}

function calculateAdjustedExpectation(baseExpectedMinutes: number, events: CalendarEvent[]) {
  const hasFullNeutralizer = events.some((event) =>
    event.type === 'HOLIDAY' || event.type === 'VACATION' || event.type === 'MEDICAL_LEAVE_FULL')
  if (hasFullNeutralizer) return { expectedMinutes: 0, justifiedMinutes: baseExpectedMinutes }
  const partialMinutes = events
    .filter((event) => event.type === 'MEDICAL_LEAVE_PARTIAL')
    .reduce((total, event) => total + Math.max(0, event.justifiedMinutes ?? 0), 0)
  const justifiedMinutes = Math.min(baseExpectedMinutes, partialMinutes)
  return { expectedMinutes: baseExpectedMinutes - justifiedMinutes, justifiedMinutes }
}

function hasFullNeutralizer(events: CalendarEvent[]) {
  return events.some((event) => event.type === 'HOLIDAY' || event.type === 'VACATION' || event.type === 'MEDICAL_LEAVE_FULL')
}

function deriveVisualState(
  events: CalendarEvent[],
  hasApprovedTimeOff: boolean,
  expectedMinutes: number,
  workedMinutes: number,
): CalendarVisualState {
  if (events.some((event) => event.type === 'VACATION')) return 'VACATION'
  if (events.some((event) => event.type === 'HOLIDAY')) return 'HOLIDAY'
  if (events.some((event) => event.type.startsWith('MEDICAL_LEAVE'))) return 'MEDICAL_LEAVE'
  if (hasApprovedTimeOff) return 'TIME_OFF'
  if (expectedMinutes === 0 && workedMinutes === 0) return 'NO_SCHEDULE'
  if (workedMinutes === 0) return 'NO_ENTRY'
  if (workedMinutes < expectedMinutes) return 'INCOMPLETE'
  if (workedMinutes === expectedMinutes) return 'COMPLETE'
  return 'EXCEEDED'
}

export function calculateDaySummary(input: DaySummaryInput): DailySummary {
  const applicableEvents = input.events.filter((event) => eventApplies(event, input.collaboratorId, input.date))
  const baseExpectedMinutes = getBaseExpectedMinutes(input.date, input.workloadVersions)
  const adjustedExpectation = calculateAdjustedExpectation(baseExpectedMinutes, applicableEvents)
  const recordedWorkedMinutes = input.entries.reduce((total, entry) => {
    if (entry.collaboratorId !== input.collaboratorId || entry.entryDate !== input.date || !isCountableTimeEntryStatus(entry.status)) return total
    return total + entry.durationMinutes
  }, 0)
  const isFuture = compareIsoDates(input.date, input.today) > 0
  const hasIntegralEvent = hasFullNeutralizer(applicableEvents)
  const expectedMinutes = isFuture ? 0 : adjustedExpectation.expectedMinutes
  const justifiedMinutes = isFuture ? 0 : adjustedExpectation.justifiedMinutes
  const workedMinutes = isFuture || hasIntegralEvent ? 0 : recordedWorkedMinutes
  const regularMinutes = Math.min(workedMinutes, expectedMinutes)
  const extraMinutes = Math.max(workedMinutes - expectedMinutes, 0)
  const missingMinutes = Math.max(expectedMinutes - workedMinutes, 0)
  const hasApprovedTimeOff = input.timeOffRequests.some((request) =>
    request.collaboratorId === input.collaboratorId && requestAppliesToDate(request, input.date) && request.status === 'APPROVED')

  return {
    date: input.date,
    baseExpectedMinutes,
    expectedMinutes,
    justifiedMinutes,
    workedMinutes,
    regularMinutes,
    extraMinutes,
    missingMinutes,
    balanceMinutes: workedMinutes - expectedMinutes,
    isFuture,
    hasIntegralEventConflict: hasIntegralEvent && recordedWorkedMinutes > 0,
    visualState: deriveVisualState(applicableEvents, hasApprovedTimeOff, expectedMinutes, workedMinutes),
  }
}

type PeriodSummaryInput = Omit<DaySummaryInput, 'date'> & { startDate: string; endDate: string }

export function calculatePeriodSummary(input: PeriodSummaryInput): PeriodSummary {
  const days = eachIsoDate(input.startDate, input.endDate).map((date) => calculateDaySummary({ ...input, date }))
  return days.reduce<PeriodSummary>((summary, day) => {
    summary.expectedMinutes += day.expectedMinutes
    summary.workedMinutes += day.workedMinutes
    summary.regularMinutes += day.regularMinutes
    summary.extraMinutes += day.extraMinutes
    summary.missingMinutes += day.missingMinutes
    summary.justifiedMinutes += day.justifiedMinutes
    summary.realBalanceMinutes += day.balanceMinutes
    return summary
  }, {
    startDate: input.startDate,
    endDate: input.endDate,
    expectedMinutes: 0,
    workedMinutes: 0,
    regularMinutes: 0,
    extraMinutes: 0,
    missingMinutes: 0,
    justifiedMinutes: 0,
    realBalanceMinutes: 0,
    hasFutureDates: compareIsoDates(input.endDate, input.today) > 0,
    days,
  })
}

export function getCalendarVisualState(summary: DailySummary) {
  return { state: summary.visualState, label: calendarStatePresentation[summary.visualState].label }
}

export function shiftMonth(monthKey: string, amount: number) {
  const [year, month] = monthKey.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1 + amount, 1, 12))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`
}

export type MonthGridCell =
  | { kind: 'placeholder'; key: string }
  | { kind: 'day'; key: string; date: string }

export function getMonthGridCells(monthKey: string): MonthGridCell[] {
  const firstDate = `${monthKey}-01`
  const firstWeekday = new Date(`${firstDate}T12:00:00.000Z`).getUTCDay()
  const leadingPlaceholders = firstWeekday === 0 ? 6 : firstWeekday - 1
  const [year, month] = monthKey.split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(year, month, 0, 12)).getUTCDate()
  const trailingPlaceholders = (7 - ((leadingPlaceholders + daysInMonth) % 7)) % 7

  return [
    ...Array.from({ length: leadingPlaceholders }, (_, index): MonthGridCell => ({
      kind: 'placeholder', key: `leading-${index}`,
    })),
    ...Array.from({ length: daysInMonth }, (_, index): MonthGridCell => {
      const date = `${monthKey}-${String(index + 1).padStart(2, '0')}`
      return { kind: 'day', key: date, date }
    }),
    ...Array.from({ length: trailingPlaceholders }, (_, index): MonthGridCell => ({
      kind: 'placeholder', key: `trailing-${index}`,
    })),
  ]
}
