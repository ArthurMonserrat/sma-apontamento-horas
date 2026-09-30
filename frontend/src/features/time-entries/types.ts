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
  clientName: string
  projectCode: string
  contractorNumber?: string
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

export type CreateTimeEntryData = Pick<
  TimeEntry,
  | 'entryDate'
  | 'clientName'
  | 'projectCode'
  | 'contractorNumber'
  | 'ldDocument'
  | 'activityId'
  | 'disciplineCode'
  | 'documentTypeCode'
  | 'durationMinutes'
  | 'details'
> & {
  endDate?: string
  weekdaysOnly?: boolean
}

export type TimeEntryValidationErrors = Partial<Record<keyof CreateTimeEntryData, string>>
