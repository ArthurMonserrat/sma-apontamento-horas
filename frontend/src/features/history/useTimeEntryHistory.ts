import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { dayApprovalService } from '../approvals'
import { timeEntryService } from '../time-entries'
import type { DayApproval } from '../approvals/types'
import { isDayApprovalApplicable } from '../approvals/domain'
import type { TimeEntry } from '../time-entries/types'
import { getCorporateToday, getMonthKey, isIsoDate } from '../../shared/lib/date'
import { useSession } from '../session/useSession'
import {
  getInitialHistoryPagination,
  resolveHistoryPeriod,
  toServiceStatusFilter,
  type EntrySituationFilter,
  type HistoryPeriodMode,
} from './domain'
import { calendarEventService } from '../calendar/infrastructure/calendarEventService'
import { holidayProvider } from '../calendar/infrastructure/holidayProvider'
import { profileService } from '../profile/infrastructure/profileService'
import { workloadService } from '../workloads/infrastructure/workloadService'
import { calculateDaySummary, calculatePeriodSummary } from '../calendar/domain'
import type { CalendarEvent, DailySummary, PeriodSummary } from '../calendar/types'
import { localDataAccessError } from '../session/sessionActor'

export type HistoryFiltersValue = {
  mode: HistoryPeriodMode
  day: string
  month: string
  startDate: string
  endDate: string
  contractorNumber: string
  primaryCode: string
  secondaryCode: string
  activityId: string
  status: EntrySituationFilter
}

export type HistoryRow = {
  entry: TimeEntry
  approval: DayApproval | null
  summary: DailySummary
  events: CalendarEvent[]
  canMutate: boolean
}

const today = getCorporateToday()
function createInitialFilters(date = today): HistoryFiltersValue {
  const safeDate = isIsoDate(date) ? date : today
  return {
    mode: safeDate === today ? 'MONTH' : 'DAY',
    day: safeDate,
    month: getMonthKey(safeDate),
    startDate: `${getMonthKey(safeDate)}-01`,
    endDate: safeDate,
    contractorNumber: '',
    primaryCode: '',
    secondaryCode: '',
    activityId: '',
    status: 'ACTIVE',
  }
}

function holidaysToEvents(collaboratorId: string, holidays: Awaited<ReturnType<typeof holidayProvider.list>>): CalendarEvent[] {
  return holidays.map((holiday) => ({
    id: holiday.id, collaboratorId, type: 'HOLIDAY', startDate: holiday.date, endDate: holiday.date,
    title: holiday.name, source: holiday.source === 'DEMO' ? 'DEMO' : 'COMPANY', createdAt: `${holiday.date}T12:00:00.000Z`,
  }))
}

export function useTimeEntryHistory() {
  const { profile, session } = useSession()
  const [searchParams] = useSearchParams()
  const initialFilters = createInitialFilters(searchParams.get('date') ?? today)
  const [draftFilters, setDraftFilters] = useState(initialFilters)
  const [filters, setFilters] = useState(initialFilters)
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [cursor, setCursor] = useState<string | undefined>()
  const [cursorHistory, setCursorHistory] = useState<string[]>([])
  const [total, setTotal] = useState(0)
  const [periodSummary, setPeriodSummary] = useState<PeriodSummary | null>(null)
  const [periodEvents, setPeriodEvents] = useState<CalendarEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const load = useCallback(async () => {
    const corporateDataError = localDataAccessError(session)
    if (corporateDataError) {
      setRows([])
      setPeriodSummary(null)
      setPeriodEvents([])
      setIsLoading(false)
      setError(`${corporateDataError} O histórico corporativo ainda não está integrado aos serviços de jornada.`)
      return
    }
    if (!profile) return
    setIsLoading(true)
    setError(null)
    try {
      const [professionalProfile, workloadVersions] = await Promise.all([
        profileService.getById(profile.id),
        workloadService.listVersions(profile.id),
      ])
      if (!professionalProfile) throw new Error('Perfil profissional não encontrado.')
      const period = resolveHistoryPeriod({ ...filters, firstAvailableDate: workloadVersions[0]?.effectiveFrom ?? today, today })
      const [page, periodEntries, calendarEvents, holidays] = await Promise.all([
        timeEntryService.list({
        collaboratorId: profile.id,
        ...period,
        pageSize: 10,
        cursor,
        filters: {
          contractorNumber: filters.contractorNumber.trim() || undefined,
          primaryCode: filters.primaryCode.trim() || undefined,
          secondaryCode: filters.secondaryCode.trim() || undefined,
          activityId: filters.activityId || undefined,
          status: toServiceStatusFilter(filters.status),
        },
        }),
        timeEntryService.listByRange(profile.id, period.startDate, period.endDate),
        calendarEventService.listByRange(profile.id, period.startDate, period.endDate),
        holidayProvider.list(professionalProfile.location, period.startDate, period.endDate),
      ])
      const allEvents = [...calendarEvents, ...holidaysToEvents(profile.id, holidays)]
      const summary = calculatePeriodSummary({
        ...period, today, collaboratorId: profile.id, entries: periodEntries, events: allEvents,
        workloadVersions,
      })
      const enriched = await Promise.all(page.items.map(async (entry) => {
        const entriesOfDay = periodEntries.filter((item) => item.entryDate === entry.entryDate)
        const eventsOfDay = allEvents.filter((event) => event.startDate <= entry.entryDate && event.endDate >= entry.entryDate)
        const daySummary = calculateDaySummary({ date: entry.entryDate, today, collaboratorId: profile.id, entries: entriesOfDay, events: eventsOfDay, workloadVersions })
        const approval = await dayApprovalService.getForDate(
          profile.id,
          entry.entryDate,
          entriesOfDay.some((item) => item.status === 'ACTIVE'),
          entry.assignmentSnapshot,
          isDayApprovalApplicable(daySummary),
        )
        return {
          entry, approval, events: eventsOfDay,
          summary: daySummary,
          canMutate: await dayApprovalService.canMutate(profile.id, entry.entryDate),
        }
      }))
      setRows(enriched)
      setNextCursor(page.nextCursor)
      setTotal(page.total)
      setPeriodSummary(summary)
      setPeriodEvents(allEvents)
    } catch (loadError) {
      setRows([])
      setPeriodSummary(null)
      setPeriodEvents([])
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar o histórico.')
    } finally {
      setIsLoading(false)
    }
  }, [cursor, filters, profile, session])

  useEffect(() => { void load() }, [load])

  const applyFilters = () => {
    const pagination = getInitialHistoryPagination()
    setCursor(pagination.cursor)
    setCursorHistory(pagination.cursorHistory)
    setFilters(draftFilters)
  }

  const nextPage = () => {
    if (!nextCursor) return
    setCursorHistory((history) => [...history, cursor ?? '0'])
    setCursor(nextCursor)
  }

  const previousPage = () => {
    const previous = cursorHistory.at(-1)
    if (previous === undefined) return
    setCursorHistory((history) => history.slice(0, -1))
    setCursor(previous === '0' ? undefined : previous)
  }

  const cancel = async (row: HistoryRow, reason: string) => {
    const corporateDataError = localDataAccessError(session)
    if (corporateDataError) {
      setError(`${corporateDataError} O cancelamento corporativo permanece bloqueado.`)
      return
    }
    if (!profile) return
    await timeEntryService.cancel(profile.id, row.entry.id, row.entry.version, reason)
    setFeedback('Apontamento cancelado. O registro foi preservado no histórico.')
    await load()
  }

  const completeCorrection = async (row: HistoryRow) => {
    const corporateDataError = localDataAccessError(session)
    if (corporateDataError) {
      setError(`${corporateDataError} A conclusão de correções corporativas permanece bloqueada.`)
      return
    }
    if (!profile || !row.approval) return
    await dayApprovalService.completeCorrection(profile.id, row.entry.entryDate, row.approval.version)
    setFeedback('Correção concluída. O dia voltou a ficar disponível para aprovação.')
    await load()
  }

  return {
    draftFilters, setDraftFilters, applyFilters, rows, total, isLoading, error, feedback,
    periodSummary, periodEvents,
    nextCursor, hasPreviousPage: cursorHistory.length > 0, nextPage, previousPage, cancel, completeCorrection, reload: load,
  }
}
