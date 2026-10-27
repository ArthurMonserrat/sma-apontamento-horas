import { MAX_CLIENT_NAME_LENGTH, MAX_ENTRY_MINUTES, MAX_PROJECT_CODE_LENGTH } from '../../../config/business'
import { isIsoDate } from '../../../shared/lib/date'
import type { CreateTimeEntryData } from '../types'
import { isAllowedDocumentType, isDisciplineCode, isLdDocumentSnapshot } from '../documentCatalog'

/** Validação e limpeza dos dados de um apontamento (mesmas regras no armazenamento local e no banco). */
export function normalizeCreateData(data: CreateTimeEntryData): CreateTimeEntryData {
  const { endDate: _endDate, weekdaysOnly: _weekdaysOnly, ...baseData } = data
  const projectCode = data.projectCode.trim()
  const clientName = data.clientName.trim()
  const details = data.details.trim()
  if (!isIsoDate(data.entryDate)) throw new Error('Informe uma data válida.')
  if (data.endDate && !isIsoDate(data.endDate)) throw new Error('Informe uma data final válida.')
  if (data.endDate && data.endDate < data.entryDate) throw new Error('A data final deve ser igual ou posterior à data inicial.')
  if (!clientName || clientName.length > MAX_CLIENT_NAME_LENGTH) throw new Error('Informe um cliente válido.')
  if (!projectCode || projectCode.length > MAX_PROJECT_CODE_LENGTH) throw new Error('Informe um código de projeto válido.')
  if (!data.activityId) throw new Error('Informe a atividade.')
  if (!isDisciplineCode(data.disciplineCode)) throw new Error('Informe a disciplina.')
  if (!isAllowedDocumentType(data.documentTypeCode, data.ldDocument)) throw new Error('Informe o tipo de documento.')
  if (data.ldDocument !== undefined && !isLdDocumentSnapshot(data.ldDocument)) throw new Error('Documento da LD inválido.')
  if (data.contractorNumber !== undefined && (typeof data.contractorNumber !== 'string' || data.contractorNumber.trim().length > 160)) throw new Error('Número da contratada inválido.')
  if (!Number.isInteger(data.durationMinutes) || data.durationMinutes <= 0 || data.durationMinutes > MAX_ENTRY_MINUTES) {
    throw new Error('Informe uma duração válida.')
  }
  return { ...baseData, clientName, projectCode, details, contractorNumber: data.contractorNumber?.trim() }
}

