import type { AssignmentSnapshot } from '../squads/types'

export type TimeEntryStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ACTIVE' | 'CANCELLED'
export type DisciplineCode = '—' | 'A' | 'E' | 'G' | 'M'
export type ManualDocumentTypeCode =
  | '—'
  | 'RN'
  | 'GR'
  | 'G'
  | 'FD'
  | 'DE'
  | 'LM'
  | 'DI'
  | 'LC'
  | 'LI'
  | 'ET'
  | 'MC'
  | 'MO'
  | 'MD'
  | 'FG'
  | 'LA'
  | 'ES'
  | 'CF'

export type DocumentTypeCode = string

export interface LdDocumentSnapshot {
  valeNumber: string
  title: string
  documentTypeCode: string
  disciplineName: string
  fileName: string
}

export interface TimeEntry {
  id: string
  collaboratorId: string
  entryDate: string
  /** Dados legados, preservados para consulta de registros antigos. */
  clientName: string
  projectCode: string
  contractorNumber?: string
  primaryCode?: string
  secondaryCode?: string
  /** Projeto/atividade cadastrados pela diretoria (null = apontamento sem projeto). */
  projectId?: string | null
  projectActivityId?: string | null
  ldDocument?: LdDocumentSnapshot
  activityId: string
  disciplineCode: DisciplineCode
  documentTypeCode: DocumentTypeCode
  durationMinutes: number
  details: string
  assignmentSnapshot: AssignmentSnapshot | null
  status: TimeEntryStatus
  version: number
  createdAt: string
  updatedAt: string
  lastEditReason?: string
  sourceEntryId?: string
  cancelledAt?: string
  cancelReason?: string
}

/** Dados usados para criar ou editar novos apontamentos manuais. */
export type CreateTimeEntryData = {
  entryDate: string
  contractorNumber?: string
  primaryCode?: string
  secondaryCode?: string
  activityId: string
  durationMinutes: number
  details: string
  /** Campos legados aceitos apenas para preservar integrações antigas. Não vêm do formulário. */
  clientName?: string
  projectCode?: string
  projectId?: string | null
  projectActivityId?: string | null
  ldDocument?: LdDocumentSnapshot
  disciplineCode?: DisciplineCode
  documentTypeCode?: DocumentTypeCode
  endDate?: string
  weekdaysOnly?: boolean
}

export type TimeEntryValidationErrors = Partial<Record<keyof CreateTimeEntryData, string>>
