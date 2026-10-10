import { CORPORATE_TIME_ZONE } from '../../../config/business'

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/

function isoDateToUtc(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day, 12))
}

export function isIsoDate(value: string) {
  if (!isoDatePattern.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = isoDateToUtc(value)
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

export function getCorporateToday(now = new Date(), timeZone = CORPORATE_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function getTodayIsoDate() {
  return getCorporateToday()
}

export function compareIsoDates(left: string, right: string) {
  return left.localeCompare(right)
}

export function addDays(value: string, amount: number) {
  const date = isoDateToUtc(value)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

export function eachIsoDate(startDate: string, endDate: string) {
  if (!isIsoDate(startDate) || !isIsoDate(endDate) || compareIsoDates(startDate, endDate) > 0) return []
  const dates: string[] = []
  for (let current = startDate; compareIsoDates(current, endDate) <= 0; current = addDays(current, 1)) {
    dates.push(current)
  }
  return dates
}

export function getMonthRange(monthKey: string) {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) throw new Error('Competência inválida.')
  const [year, month] = monthKey.split('-').map(Number)
  const endDay = new Date(Date.UTC(year, month, 0, 12)).getUTCDate()
  return { startDate: `${monthKey}-01`, endDate: `${monthKey}-${String(endDay).padStart(2, '0')}` }
}

export function isWeekend(value: string) {
  const weekday = isoDateToUtc(value).getUTCDay()
  return weekday === 0 || weekday === 6
}

export function getMonthKey(value: string) {
  return value.slice(0, 7)
}

export function getMonthClosingDate(value: string) {
  return getMonthRange(getMonthKey(value)).endDate
}

export function getDaysUntilMonthClosing(today = getCorporateToday(), closingDate = getMonthClosingDate(today)) {
  if (!isIsoDate(today) || !isIsoDate(closingDate)) return 0
  const millisecondsPerDay = 24 * 60 * 60 * 1000
  return Math.max(0, Math.round((isoDateToUtc(closingDate).getTime() - isoDateToUtc(today).getTime()) / millisecondsPerDay))
}

export function formatDatePtBr(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number)
  if (!year || !month || !day) return isoDate
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day, 12)))
}
