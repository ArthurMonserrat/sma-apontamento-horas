export type CalendarEventType =
  | 'HOLIDAY'
  | 'VACATION'
  | 'MEDICAL_LEAVE_FULL'
  | 'MEDICAL_LEAVE_PARTIAL'

export interface CalendarEvent {
  id: string
  collaboratorId: string
  type: CalendarEventType
  startDate: string
  endDate: string
  justifiedMinutes?: number
  title: string
  source: 'DEMO' | 'COMPANY'
  recordedBy?: string
  note?: string
  createdAt: string
}

export interface Holiday {
  id: string
  date: string
  name: string
  countryCode: string
  stateCode?: string
  city?: string
  scope: 'NATIONAL' | 'STATE' | 'CITY'
  source: 'DEMO' | 'OFFICIAL'
}

export type CalendarVisualState =
  | 'NO_SCHEDULE'
  | 'NO_ENTRY'
  | 'INCOMPLETE'
  | 'COMPLETE'
  | 'EXCEEDED'
  | 'VACATION'
  | 'MEDICAL_LEAVE'
  | 'HOLIDAY'

export interface DailySummary {
  date: string
  baseExpectedMinutes: number
  expectedMinutes: number
  justifiedMinutes: number
  workedMinutes: number
  regularMinutes: number
  extraMinutes: number
  missingMinutes: number
  balanceMinutes: number
  isFuture: boolean
  hasIntegralEventConflict: boolean
  visualState: CalendarVisualState
}

export interface PeriodSummary {
  startDate: string
  endDate: string
  expectedMinutes: number
  workedMinutes: number
  regularMinutes: number
  extraMinutes: number
  missingMinutes: number
  justifiedMinutes: number
  realBalanceMinutes: number
  hasFutureDates: boolean
  days: DailySummary[]
}
