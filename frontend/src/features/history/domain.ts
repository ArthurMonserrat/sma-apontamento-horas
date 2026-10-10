import { getMonthRange, isIsoDate } from '../../shared/lib/date'
import type { TimeEntryStatus } from '../time-entries/types'

export type HistoryPeriodMode = 'DAY' | 'MONTH' | 'RANGE' | 'ALL'
export type EntrySituationFilter = TimeEntryStatus | 'ALL'

export type HistoryPeriodInput = {
  mode: HistoryPeriodMode
  day: string
  month: string
  startDate: string
  endDate: string
  firstAvailableDate: string
  today: string
}

export function resolveHistoryPeriod(input: HistoryPeriodInput) {
  if (input.mode === 'ALL') return { startDate: input.firstAvailableDate, endDate: input.today }
  if (input.mode === 'MONTH') return getMonthRange(input.month)
  if (input.mode === 'DAY') {
    if (!isIsoDate(input.day)) throw new Error('Informe um dia válido.')
    return { startDate: input.day, endDate: input.day }
  }
  if (!isIsoDate(input.startDate) || !isIsoDate(input.endDate)) throw new Error('Informe um intervalo válido.')
  if (input.startDate > input.endDate) throw new Error('A data inicial do intervalo deve ser anterior à data final.')
  return { startDate: input.startDate, endDate: input.endDate }
}

export function toServiceStatusFilter(status: EntrySituationFilter): TimeEntryStatus | undefined {
  return status === 'ALL' ? undefined : status
}

export function getInitialHistoryPagination() {
  return { cursor: undefined as string | undefined, cursorHistory: [] as string[] }
}
