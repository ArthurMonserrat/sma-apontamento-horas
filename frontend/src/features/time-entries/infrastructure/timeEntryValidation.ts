import { MAX_ENTRY_MINUTES, MAX_PROJECT_CODE_LENGTH } from '../../../config/business'
import { isIsoDate } from '../../../shared/lib/date'
import type { CreateTimeEntryData } from '../types'

/** Validação e limpeza dos dados de um apontamento (mesmas regras no armazenamento local e no banco). */
export function normalizeCreateData(data: CreateTimeEntryData): CreateTimeEntryData {
  const contractorNumber = data.contractorNumber?.trim() ?? data.projectCode?.trim() ?? ''
  const details = data.details.trim()
  if (!isIsoDate(data.entryDate)) throw new Error('Informe uma data válida.')
  if (data.endDate && !isIsoDate(data.endDate)) throw new Error('Informe uma data final válida.')
  if (data.endDate && data.endDate < data.entryDate) throw new Error('A data final deve ser igual ou posterior à data inicial.')
  if (!contractorNumber || contractorNumber.length > MAX_PROJECT_CODE_LENGTH) throw new Error('Informe um número de projeto ou obra válido.')
  if (!data.activityId) throw new Error('Informe a atividade.')
  if ((data.primaryCode?.trim().length ?? 0) > 160) throw new Error('Código primário inválido.')
  if ((data.secondaryCode?.trim().length ?? 0) > 160) throw new Error('Código secundário inválido.')
  if ((data.funcaoContrato?.trim().length ?? 0) > 160) throw new Error('Função contratual inválida.')
  if (!Number.isInteger(data.durationMinutes) || data.durationMinutes <= 0 || data.durationMinutes > MAX_ENTRY_MINUTES) {
    throw new Error('Informe uma duração válida.')
  }
  return {
    ...data,
    contractorNumber,
    projectCode: contractorNumber,
    clientName: data.clientName?.trim() ?? '',
    disciplineCode: '—',
    documentTypeCode: '—',
    ldDocument: undefined,
    projectId: undefined,
    projectActivityId: undefined,
    primaryCode: data.primaryCode?.trim() || undefined,
    secondaryCode: data.secondaryCode?.trim() || undefined,
    funcaoContrato: data.funcaoContrato?.trim() || undefined,
    details,
  }
}

