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
  /** @deprecated Preservado somente para leitura de registros legados. */
  clientName?: string
  projectCode: string
  contractorNumber?: string
  primaryCode?: string
  secondaryCode?: string
  /** @deprecated Preservado somente para migração de registros legados. */
  ldDocument?: LdDocumentSnapshot
  activityId: string
  /** @deprecated Preservado somente para migração de registros legados. */
  disciplineCode?: DisciplineCode
  /** @deprecated Preservado somente para migração de registros legados. */
  documentTypeCode?: DocumentTypeCode
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
  rejectionReason?: string
  decidedAt?: string
  decidedBy?: string
}

export type CreateTimeEntryData = Pick<
  TimeEntry,
  | 'entryDate'
  | 'projectCode'
  | 'contractorNumber'
  | 'primaryCode'
  | 'secondaryCode'
  | 'activityId'
  | 'durationMinutes'
  | 'details'
> & Partial<Pick<TimeEntry, 'clientName' | 'ldDocument' | 'disciplineCode' | 'documentTypeCode'>> & {
  endDate?: string
  weekdaysOnly?: boolean
}

export type TimeEntryValidationErrors = Partial<Record<keyof CreateTimeEntryData, string>>
