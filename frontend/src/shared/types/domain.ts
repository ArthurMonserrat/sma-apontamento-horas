export interface Client {
  id: string
  name: string
  active: boolean
}

export interface Activity {
  id: string
  name: string
  active: boolean
}

export interface DailySummary {
  date: string
  expectedMinutes: number
  workedMinutes: number
  regularMinutes: number
  extraMinutes: number
  missingMinutes: number
  balanceMinutes: number
}
