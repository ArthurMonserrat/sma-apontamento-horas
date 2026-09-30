import { MAX_CLIENT_NAME_LENGTH, MAX_ENTRY_MINUTES, MAX_PROJECT_CODE_LENGTH } from '../config/business'
import type { AssignmentSnapshot } from '../features/squads/types'
import type { DisciplineCode, DocumentTypeCode, TimeEntry } from '../features/time-entries/types'
import { isAllowedDocumentType, isDisciplineCode, isLdDocumentSnapshot } from '../features/time-entries/documentCatalog'
import { isIsoDate } from '../shared/utils/date'

export const LEGACY_V1_TIME_ENTRY_STORAGE_KEY = 'sma:time-entries:v1'
export const LEGACY_V2_TIME_ENTRY_STORAGE_KEY = 'sma:time-entries:v2'
export const LEGACY_V3_TIME_ENTRY_STORAGE_KEY = 'sma:time-entries:v3'

const legacyProjectCodeById: Readonly<Record<string, string>> = {
  'project-alpha-automation': 'ALF-001',
  'project-alpha-electrical': 'ALF-002',
  'project-beta-expansion': 'BET-101',
}

const legacyClientNameById: Readonly<Record<string, string>> = {
  'client-industrial-alpha': 'Cliente Industrial Alfa',
  'client-energy-beta': 'Cliente Energia Beta',
}

const safeLegacyAssignmentByCollaboratorId: Readonly<Record<string, AssignmentSnapshot>> = {
  'demo-collaborator-001': {
    squadId: 'squad-automation',
    squadName: 'Engenharia de Automação',
    supervisorId: 'supervisor-demo-001',
    supervisorName: 'Jeen Carlos E. Azevedo',
  },
}

type LegacyV3TimeEntry = Omit<TimeEntry, 'clientName'> & { clientId: string }
type V2TimeEntry = Omit<LegacyV3TimeEntry, 'disciplineCode' | 'documentTypeCode' | 'assignmentSnapshot'> & {
  disciplineCode?: unknown
  documentTypeCode?: unknown
  assignmentSnapshot?: unknown
}
type V1TimeEntry = Omit<V2TimeEntry, 'projectCode'> & { projectId: string }

export type TimeEntryStorageV2 = { version: 2; entriesByCollaborator: Record<string, V2TimeEntry[]> }
export type TimeEntryStorageV3 = { version: 3; entriesByCollaborator: Record<string, LegacyV3TimeEntry[]> }
export type TimeEntryStorageV4 = { version: 4; entriesByCollaborator: Record<string, TimeEntry[]> }

export type TimeEntryMigrationResult<T> = {
  data: T
  migratedCount: number
  skippedCount: number
}

const disciplineCodes: readonly DisciplineCode[] = ['—', 'A', 'E']
const documentTypeCodes: readonly DocumentTypeCode[] = [
  '—', 'RN', 'GR', 'G', 'FD', 'DE', 'LM', 'DI', 'LC', 'LI', 'ET', 'MC', 'MO', 'MD', 'FG', 'LA', 'ES', 'CF',
]
const timeEntryStatuses: readonly TimeEntry['status'][] = ['PENDING', 'APPROVED', 'REJECTED', 'ACTIVE', 'CANCELLED']

function isAssignmentSnapshot(value: unknown): value is AssignmentSnapshot {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as Record<string, unknown>
  return typeof snapshot.squadId === 'string'
    && typeof snapshot.squadName === 'string'
    && typeof snapshot.supervisorId === 'string'
    && typeof snapshot.supervisorName === 'string'
}

function isLegacyEntry(value: unknown, collaboratorId: string, projectField: 'projectId' | 'projectCode') {
  if (!value || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  return typeof entry.id === 'string'
    && entry.collaboratorId === collaboratorId
    && isIsoDate(String(entry.entryDate))
    && typeof entry.clientId === 'string'
    && Boolean(entry.clientId.trim())
    && typeof entry[projectField] === 'string'
    && Boolean(String(entry[projectField]).trim())
    && String(entry[projectField]).trim().length <= MAX_PROJECT_CODE_LENGTH
    && typeof entry.activityId === 'string'
    && Number.isInteger(entry.durationMinutes)
    && Number(entry.durationMinutes) > 0
    && Number(entry.durationMinutes) <= MAX_ENTRY_MINUTES
    && typeof entry.details === 'string'
    && timeEntryStatuses.includes(entry.status as TimeEntry['status'])
    && Number.isInteger(entry.version)
    && Number(entry.version) > 0
    && typeof entry.createdAt === 'string'
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value ? value : undefined
}

function commonEntryIsInvalid(entry: Record<string, unknown>, collaboratorId: string) {
  return typeof entry.id !== 'string'
    || entry.collaboratorId !== collaboratorId
    || !isIsoDate(String(entry.entryDate))
    || typeof entry.projectCode !== 'string'
    || !entry.projectCode
    || entry.projectCode !== entry.projectCode.trim()
    || entry.projectCode.length > MAX_PROJECT_CODE_LENGTH
    || typeof entry.activityId !== 'string'
    || !isDisciplineCode(entry.disciplineCode)
    || !isAllowedDocumentType(entry.documentTypeCode, entry.ldDocument)
    || (entry.ldDocument !== undefined && !isLdDocumentSnapshot(entry.ldDocument))
    || (entry.contractorNumber !== undefined && (typeof entry.contractorNumber !== 'string' || entry.contractorNumber.trim().length > 160))
    || !Number.isInteger(entry.durationMinutes)
    || Number(entry.durationMinutes) <= 0
    || Number(entry.durationMinutes) > MAX_ENTRY_MINUTES
    || typeof entry.details !== 'string'
    || (entry.assignmentSnapshot !== null && !isAssignmentSnapshot(entry.assignmentSnapshot))
    || !timeEntryStatuses.includes(entry.status as TimeEntry['status'])
    || !Number.isInteger(entry.version)
    || Number(entry.version) <= 0
    || typeof entry.createdAt !== 'string'
}

function sharedFields(entry: Record<string, unknown>, collaboratorId: string) {
  return {
    id: entry.id as string,
    collaboratorId,
    entryDate: String(entry.entryDate),
    projectCode: entry.projectCode as string,
    contractorNumber: typeof entry.contractorNumber === 'string' ? entry.contractorNumber.trim() : undefined,
    ldDocument: isLdDocumentSnapshot(entry.ldDocument) ? entry.ldDocument : undefined,
    activityId: entry.activityId as string,
    disciplineCode: entry.disciplineCode as DisciplineCode,
    documentTypeCode: entry.documentTypeCode as DocumentTypeCode,
    durationMinutes: Number(entry.durationMinutes),
    details: (entry.details as string).trim(),
    assignmentSnapshot: entry.assignmentSnapshot as AssignmentSnapshot | null,
    status: entry.status as TimeEntry['status'],
    version: Number(entry.version),
    createdAt: entry.createdAt as string,
    updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : '',
    lastEditReason: optionalString(entry.lastEditReason),
    sourceEntryId: optionalString(entry.sourceEntryId),
    cancelledAt: optionalString(entry.cancelledAt),
    cancelReason: optionalString(entry.cancelReason),
  }
}

function normalizeV3TimeEntry(value: unknown, collaboratorId: string): LegacyV3TimeEntry | null {
  if (!value || typeof value !== 'object') return null
  const entry = value as Record<string, unknown>
  if (commonEntryIsInvalid(entry, collaboratorId) || typeof entry.clientId !== 'string' || !entry.clientId.trim()) return null
  return { ...sharedFields(entry, collaboratorId), clientId: entry.clientId.trim() }
}

export function normalizeTimeEntry(value: unknown, collaboratorId: string): TimeEntry | null {
  if (!value || typeof value !== 'object') return null
  const entry = value as Record<string, unknown>
  if (commonEntryIsInvalid(entry, collaboratorId)
    || typeof entry.clientName !== 'string'
    || !entry.clientName.trim()
    || entry.clientName.trim().length > MAX_CLIENT_NAME_LENGTH) return null
  return { ...sharedFields(entry, collaboratorId), clientName: entry.clientName.trim() }
}

function migrateV2Entry(entry: V2TimeEntry, collaboratorId: string): LegacyV3TimeEntry | null {
  return normalizeV3TimeEntry({
    ...entry,
    projectCode: entry.projectCode.trim(),
    disciplineCode: disciplineCodes.includes(entry.disciplineCode as DisciplineCode) ? entry.disciplineCode : '—',
    documentTypeCode: documentTypeCodes.includes(entry.documentTypeCode as DocumentTypeCode) ? entry.documentTypeCode : '—',
    assignmentSnapshot: safeLegacyAssignmentByCollaboratorId[collaboratorId] ?? null,
  }, collaboratorId)
}

export function migrateV1TimeEntries(raw: string): TimeEntryMigrationResult<TimeEntryStorageV2> {
  const parsed = JSON.parse(raw) as unknown
  if (!parsed || typeof parsed !== 'object') throw new Error('Estrutura v1 inválida.')
  const candidate = parsed as { version?: unknown; entriesByCollaborator?: unknown }
  if (candidate.version !== 1 || !candidate.entriesByCollaborator || typeof candidate.entriesByCollaborator !== 'object') throw new Error('Versão ou coleção v1 inválida.')
  let migratedCount = 0
  let skippedCount = 0
  const entriesByCollaborator = Object.fromEntries(Object.entries(candidate.entriesByCollaborator).map(([collaboratorId, entries]) => {
    if (!Array.isArray(entries)) return [collaboratorId, []]
    return [collaboratorId, entries.flatMap((value) => {
      if (!isLegacyEntry(value, collaboratorId, 'projectId')) { skippedCount += 1; return [] }
      const entry = value as V1TimeEntry
      const { projectId, ...unchanged } = entry
      const trimmedProjectId = projectId.trim()
      migratedCount += 1
      return [{ ...unchanged, projectCode: legacyProjectCodeById[trimmedProjectId] ?? trimmedProjectId }]
    })]
  }))
  return { data: { version: 2, entriesByCollaborator }, migratedCount, skippedCount }
}

export function migrateV2TimeEntries(raw: string): TimeEntryMigrationResult<TimeEntryStorageV3> {
  const parsed = JSON.parse(raw) as unknown
  if (!parsed || typeof parsed !== 'object') throw new Error('Estrutura v2 inválida.')
  const candidate = parsed as { version?: unknown; entriesByCollaborator?: unknown }
  if (candidate.version !== 2 || !candidate.entriesByCollaborator || typeof candidate.entriesByCollaborator !== 'object') throw new Error('Versão ou coleção v2 inválida.')
  let migratedCount = 0
  let skippedCount = 0
  const entriesByCollaborator = Object.fromEntries(Object.entries(candidate.entriesByCollaborator).map(([collaboratorId, entries]) => {
    if (!Array.isArray(entries)) return [collaboratorId, []]
    return [collaboratorId, entries.flatMap((entry) => {
      if (!isLegacyEntry(entry, collaboratorId, 'projectCode')) { skippedCount += 1; return [] }
      const migrated = migrateV2Entry(entry as V2TimeEntry, collaboratorId)
      if (!migrated) { skippedCount += 1; return [] }
      migratedCount += 1
      return [migrated]
    })]
  }))
  return { data: { version: 3, entriesByCollaborator }, migratedCount, skippedCount }
}

export function migrateV3TimeEntries(raw: string): TimeEntryMigrationResult<TimeEntryStorageV4> {
  const parsed = JSON.parse(raw) as unknown
  if (!parsed || typeof parsed !== 'object') throw new Error('Estrutura v3 inválida.')
  const candidate = parsed as { version?: unknown; entriesByCollaborator?: unknown }
  if (candidate.version !== 3 || !candidate.entriesByCollaborator || typeof candidate.entriesByCollaborator !== 'object') throw new Error('Versão ou coleção v3 inválida.')
  let migratedCount = 0
  let skippedCount = 0
  const entriesByCollaborator = Object.fromEntries(Object.entries(candidate.entriesByCollaborator).map(([collaboratorId, entries]) => {
    if (!Array.isArray(entries)) return [collaboratorId, []]
    return [collaboratorId, entries.flatMap((value) => {
      const entry = normalizeV3TimeEntry(value, collaboratorId)
      if (!entry) { skippedCount += 1; return [] }
      const { clientId, ...unchanged } = entry
      const migrated = normalizeTimeEntry({ ...unchanged, clientName: legacyClientNameById[clientId] ?? clientId }, collaboratorId)
      if (!migrated) { skippedCount += 1; return [] }
      migratedCount += 1
      return [migrated]
    })]
  }))
  return { data: { version: 4, entriesByCollaborator }, migratedCount, skippedCount }
}
