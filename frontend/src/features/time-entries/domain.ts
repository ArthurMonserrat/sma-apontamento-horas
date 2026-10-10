import type {
  Activity,
  CreateTimeEntryData,
  TimeEntryValidationErrors,
} from '../../shared/types/domain'
import { MAX_CLIENT_NAME_LENGTH } from '../../config/business'
import { compareIsoDates, eachIsoDate, isIsoDate, isWeekend } from '../../shared/lib/date'
import { isAllowedDocumentType, isDisciplineCode, isLdDocumentSnapshot } from './documentCatalog'
import type { TimeEntryStatus } from './types'

export const MAX_ENTRY_MINUTES = 24 * 60
export const MAX_PROJECT_CODE_LENGTH = 80

export function hoursAndMinutesToMinutes(hours: number, minutes: number) {
  return hours * 60 + minutes
}

export function areValidDurationParts(hours: number, minutes: number) {
  return Number.isInteger(hours)
    && Number.isInteger(minutes)
    && hours >= 0
    && hours <= 24
    && minutes >= 0
    && minutes <= 59
    && isValidDuration(hoursAndMinutesToMinutes(hours, minutes))
}

export function formatMinutes(totalMinutes: number) {
  const absoluteMinutes = Math.abs(Math.trunc(totalMinutes))
  const hours = Math.floor(absoluteMinutes / 60).toString().padStart(2, '0')
  const minutes = (absoluteMinutes % 60).toString().padStart(2, '0')
  return `${hours}:${minutes}`
}

export function formatSignedMinutes(totalMinutes: number) {
  if (totalMinutes === 0) return '00:00'
  return `${totalMinutes > 0 ? '+' : '-'}${formatMinutes(totalMinutes)}`
}

export function isValidDuration(durationMinutes: number) {
  return Number.isInteger(durationMinutes) && durationMinutes > 0 && durationMinutes <= MAX_ENTRY_MINUTES
}

export function isCountableTimeEntryStatus(status: TimeEntryStatus) {
  return status === 'PENDING' || status === 'APPROVED' || status === 'REJECTED' || status === 'ACTIVE'
}

function isValidIsoDate(value: string) {
  return isIsoDate(value)
}

export function expandTimeEntryDates(startDate: string, endDate: string, weekdaysOnly = true) {
  if (!isIsoDate(startDate) || !isIsoDate(endDate) || compareIsoDates(startDate, endDate) > 0) return []
  if (startDate === endDate) return [startDate]
  return eachIsoDate(startDate, endDate).filter((date) => !weekdaysOnly || !isWeekend(date))
}

export function validateTimeEntry(
  data: CreateTimeEntryData,
  activities: Activity[],
  context?: { today: string; canMutateDate: boolean },
): TimeEntryValidationErrors {
  const errors: TimeEntryValidationErrors = {}
  if (!isValidIsoDate(data.entryDate)) errors.entryDate = 'Informe uma data válida.'
  else if (context && compareIsoDates(data.entryDate, context.today) > 0) errors.entryDate = 'Não é permitido apontar horas em uma data futura.'
  else if (context && !context.canMutateDate) errors.entryDate = 'Esta data está aprovada ou fora de uma competência aberta.'
  const clientName = data.clientName.trim()
  if (!clientName) errors.clientName = 'Informe o cliente.'
  else if (clientName.length > MAX_CLIENT_NAME_LENGTH) errors.clientName = `O cliente deve ter no máximo ${MAX_CLIENT_NAME_LENGTH} caracteres.`
  const projectCode = data.projectCode.trim()
  if (!projectCode) errors.projectCode = 'Informe o número da contratada.'
  else if (projectCode.length > MAX_PROJECT_CODE_LENGTH) errors.projectCode = 'O número da contratada deve ter no máximo 80 caracteres.'
  if (!activities.some((activity) => activity.id === data.activityId && activity.active)) errors.activityId = 'Selecione uma atividade ativa.'
  if (!isDisciplineCode(data.disciplineCode)) errors.disciplineCode = 'Selecione uma disciplina.'
  if (!isAllowedDocumentType(data.documentTypeCode, data.ldDocument)) {
    errors.documentTypeCode = 'Selecione um tipo de documento.'
  }
  if (!isValidDuration(data.durationMinutes)) errors.durationMinutes = 'A duração deve ser maior que zero e de no máximo 24 horas.'
  if ((data.contractorNumber?.trim().length ?? 0) > 160) errors.contractorNumber = 'Use no máximo 160 caracteres.'
  if (data.ldDocument !== undefined && !isLdDocumentSnapshot(data.ldDocument)) errors.ldDocument = 'Os dados do documento da LD são inválidos.'
  return errors
}
