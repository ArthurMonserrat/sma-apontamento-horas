import { isWeekend } from '../../shared/lib/date'
import type { WorkloadVersion } from './types'

export function getWorkloadForDate(versions: WorkloadVersion[], date: string) {
  return versions
    .filter((version) => version.status === 'APPROVED' && version.effectiveFrom <= date)
    .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0]
}

export function getBaseExpectedMinutes(date: string, versions: WorkloadVersion[]) {
  if (isWeekend(date)) return 0
  return getWorkloadForDate(versions, date)?.dailyMinutes ?? 0
}
