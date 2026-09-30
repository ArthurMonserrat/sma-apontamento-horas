import { MAX_CLIENT_NAME_LENGTH, MAX_ENTRY_MINUTES, MAX_HISTORY_PAGE_SIZE, MAX_PROJECT_CODE_LENGTH } from '../config/business'
import { calculateDaySummary } from '../features/calendar/domain'
import type { DailySummary } from '../features/calendar/types'
import type { AuditEvent } from '../features/audit/types'
import type { AssignmentSnapshot } from '../features/squads/types'
import type { CreateTimeEntryData, DisciplineCode, DocumentTypeCode, TimeEntry } from '../features/time-entries/types'
import { expandTimeEntryDates } from '../features/time-entries/domain'
import type { WorkloadVersion } from '../features/workloads/types'
import { isIsoDate } from '../shared/utils/date'
import { createBrowserStorage, type StorageLike } from './storage'
import { auditService } from './auditService'
import { dayApprovalService } from './dayApprovalService'
import { profileService } from './profileService'
import type { EntryDateBlock } from '../features/calendar/entryDatePolicy'
import { entryDateAvailabilityService } from './entryDateAvailabilityService'
import { isAllowedDocumentType, isDisciplineCode, isLdDocumentSnapshot } from '../features/time-entries/documentCatalog'
import {
  LEGACY_V1_TIME_ENTRY_STORAGE_KEY,
  LEGACY_V2_TIME_ENTRY_STORAGE_KEY,
  LEGACY_V3_TIME_ENTRY_STORAGE_KEY,
  migrateV1TimeEntries,
  migrateV2TimeEntries,
  migrateV3TimeEntries,
  normalizeTimeEntry,
  type TimeEntryStorageV4,
} from './timeEntryMigration'

export { LEGACY_V1_TIME_ENTRY_STORAGE_KEY, LEGACY_V2_TIME_ENTRY_STORAGE_KEY, LEGACY_V3_TIME_ENTRY_STORAGE_KEY } from './timeEntryMigration'
export type { StorageLike } from './storage'

export const TIME_ENTRY_STORAGE_KEY = 'apontamentos_sma'

export type TimeEntryFilters = {
  clientName?: string
  projectCode?: string
  activityId?: string
  disciplineCode?: DisciplineCode
  documentTypeCode?: DocumentTypeCode
  status?: TimeEntry['status']
}

export type TimeEntryListQuery = {
  collaboratorId: string
  startDate: string
  endDate: string
  cursor?: string
  pageSize: number
  filters?: TimeEntryFilters
}

export type TimeEntryPage = {
  items: TimeEntry[]
  nextCursor: string | null
  total: number
}

export interface EntryMutationPolicy {
  canMutate(collaboratorId: string, date: string): Promise<boolean>
  canMutateRange?(collaboratorId: string, dates: string[]): Promise<boolean>
}

export interface EntryDateGuard {
  getBlock(collaboratorId: string, date: string): Promise<EntryDateBlock>
}

export interface AuditRecorder {
  record(event: AuditEvent): Promise<void>
}

export interface TimeEntryService {
  list(query: TimeEntryListQuery): Promise<TimeEntryPage>
  listByDate(collaboratorId: string, date: string): Promise<TimeEntry[]>
  listByRange(collaboratorId: string, startDate: string, endDate: string): Promise<TimeEntry[]>
  getById(collaboratorId: string, id: string): Promise<TimeEntry | null>
  create(collaboratorId: string, data: CreateTimeEntryData): Promise<TimeEntry>
  update(collaboratorId: string, id: string, expectedVersion: number, data: CreateTimeEntryData, reason: string): Promise<TimeEntry>
  duplicate(collaboratorId: string, id: string, expectedVersion: number, overrides: Partial<CreateTimeEntryData>): Promise<TimeEntry>
  cancel(collaboratorId: string, id: string, expectedVersion: number, reason: string): Promise<TimeEntry>
  getDailySummary(collaboratorId: string, date: string, workloadVersions: WorkloadVersion[]): Promise<DailySummary>
}

type ServiceDependencies = {
  storage: StorageLike
  createId?: () => string
  now?: () => string
  resolveAssignment?: (collaboratorId: string) => AssignmentSnapshot | null
  mutationPolicy?: EntryMutationPolicy
  dateGuard?: EntryDateGuard
  audit?: AuditRecorder
  onStorageError?: (message: string, error: unknown) => void
  onAuditError?: (message: string, error: unknown) => void
}

type ReadResult = {
  data: TimeEntryStorageV4
  canWrite: boolean
}

function normalizeCreateData(data: CreateTimeEntryData): CreateTimeEntryData {
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

function emptyStorage(): TimeEntryStorageV4 {
  return { version: 4, entriesByCollaborator: {} }
}

export class LocalStorageTimeEntryService implements TimeEntryService {
  private readonly storage: StorageLike
  private readonly createId: () => string
  private readonly now: () => string
  private readonly resolveAssignment: (collaboratorId: string) => AssignmentSnapshot | null
  private readonly mutationPolicy: EntryMutationPolicy
  private readonly dateGuard: EntryDateGuard
  private readonly audit?: AuditRecorder
  private readonly onStorageError: (message: string, error: unknown) => void
  private readonly onAuditError: (message: string, error: unknown) => void

  constructor({ storage, createId, now, resolveAssignment, mutationPolicy, dateGuard, audit, onStorageError, onAuditError }: ServiceDependencies) {
    this.storage = storage
    this.createId = createId ?? (() => crypto.randomUUID())
    this.now = now ?? (() => new Date().toISOString())
    this.resolveAssignment = resolveAssignment ?? (() => null)
    this.mutationPolicy = mutationPolicy ?? { canMutate: async () => true }
    this.dateGuard = dateGuard ?? { getBlock: async () => ({ blocked: false }) }
    this.audit = audit
    this.onStorageError = onStorageError ?? ((message, error) => console.error(message, error))
    this.onAuditError = onAuditError ?? ((message, error) => console.error(message, error))
  }

  private parseV4(raw: string): TimeEntryStorageV4 {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') throw new Error('Estrutura v4 inválida.')
    const candidate = parsed as Partial<TimeEntryStorageV4>
    if (candidate.version !== 4 || !candidate.entriesByCollaborator || typeof candidate.entriesByCollaborator !== 'object') {
      throw new Error('Versão ou coleção v4 inválida.')
    }
    const entriesByCollaborator = Object.fromEntries(
      Object.entries(candidate.entriesByCollaborator).map(([collaboratorId, entries]) => [
        collaboratorId,
        Array.isArray(entries)
          ? entries.flatMap((entry) => {
              const normalized = normalizeTimeEntry(entry, collaboratorId)
              return normalized ? [normalized] : []
            })
          : [],
      ]),
    )
    return { version: 4, entriesByCollaborator }
  }

  private read(): ReadResult {
    const empty = emptyStorage()
    try {
      const rawV4 = this.storage.getItem(TIME_ENTRY_STORAGE_KEY)
      if (rawV4 !== null) return { data: this.parseV4(rawV4), canWrite: true }

      let rawV3 = this.storage.getItem(LEGACY_V3_TIME_ENTRY_STORAGE_KEY)
      if (rawV3 === null) {
        let rawV2 = this.storage.getItem(LEGACY_V2_TIME_ENTRY_STORAGE_KEY)
        if (rawV2 === null) {
          const rawV1 = this.storage.getItem(LEGACY_V1_TIME_ENTRY_STORAGE_KEY)
          if (rawV1 === null) return { data: empty, canWrite: true }
          const v1Migration = migrateV1TimeEntries(rawV1)
          const serializedV2 = JSON.stringify(v1Migration.data)
          this.storage.setItem(LEGACY_V2_TIME_ENTRY_STORAGE_KEY, serializedV2)
          rawV2 = this.storage.getItem(LEGACY_V2_TIME_ENTRY_STORAGE_KEY)
          if (rawV2 === null || rawV2 !== serializedV2) throw new Error('A validação da migração para v2 falhou.')
        }
        const v2Migration = migrateV2TimeEntries(rawV2)
        const serializedV3 = JSON.stringify(v2Migration.data)
        this.storage.setItem(LEGACY_V3_TIME_ENTRY_STORAGE_KEY, serializedV3)
        rawV3 = this.storage.getItem(LEGACY_V3_TIME_ENTRY_STORAGE_KEY)
        if (rawV3 === null || rawV3 !== serializedV3) throw new Error('A validação da migração para v3 falhou.')
      }
      const migration = migrateV3TimeEntries(rawV3)
      const serialized = JSON.stringify(migration.data)
      this.storage.setItem(TIME_ENTRY_STORAGE_KEY, serialized)
      const persistedRaw = this.storage.getItem(TIME_ENTRY_STORAGE_KEY)
      if (persistedRaw === null) throw new Error('A v4 não foi encontrada após a migração.')
      const persisted = this.parseV4(persistedRaw)
      if (JSON.stringify(persisted) !== serialized) throw new Error('A v4 gravada diverge dos dados migrados.')
      return { data: persisted, canWrite: true }
    } catch (error) {
      this.onStorageError('Não foi possível ler os apontamentos locais. Uma coleção vazia será utilizada.', error)
      return { data: empty, canWrite: false }
    }
  }

  private writeAndValidate(data: TimeEntryStorageV4) {
    const canonical = this.parseV4(JSON.stringify(data))
    if (Object.entries(data.entriesByCollaborator).some(([id, entries]) => canonical.entriesByCollaborator[id]?.length !== entries.length)) {
      throw new Error('Um registro inválido impediu a gravação local.')
    }
    const serialized = JSON.stringify(canonical)
    this.storage.setItem(TIME_ENTRY_STORAGE_KEY, serialized)
    const persistedRaw = this.storage.getItem(TIME_ENTRY_STORAGE_KEY)
    if (persistedRaw === null) throw new Error('A gravação local não pôde ser confirmada.')
    const persisted = this.parseV4(persistedRaw)
    if (JSON.stringify(persisted) !== serialized) throw new Error('A validação da gravação local falhou.')
  }

  private async ensureMutable(collaboratorId: string, date: string) {
    if (!await this.mutationPolicy.canMutate(collaboratorId, date)) {
      throw new Error('Este dia está somente leitura ou fora de uma competência aberta.')
    }
  }

  private async ensureMutableRange(collaboratorId: string, dates: string[]) {
    if (dates.length > 1 && this.mutationPolicy.canMutateRange) {
      if (!await this.mutationPolicy.canMutateRange(collaboratorId, dates)) {
        throw new Error('Este período está somente leitura ou fora de uma competência aberta.')
      }
      return
    }
    for (const date of dates) await this.ensureMutable(collaboratorId, date)
  }

  private async ensureDateAvailable(collaboratorId: string, date: string) {
    const block = await this.dateGuard.getBlock(collaboratorId, date)
    if (block.blocked) throw new Error(block.message)
  }

  private getOwnEntry(data: TimeEntryStorageV4, collaboratorId: string, id: string) {
    const entries = data.entriesByCollaborator[collaboratorId] ?? []
    const index = entries.findIndex((entry) => entry.id === id)
    if (index < 0) throw new Error('Apontamento não encontrado para este colaborador.')
    return { entries, index, entry: entries[index] }
  }

  private assertVersion(entry: TimeEntry, expectedVersion: number) {
    if (entry.version !== expectedVersion) throw new Error('A versão do apontamento foi alterada. Recarregue os dados.')
  }

  private async record(type: AuditEvent['type'], actorId: string, entry: TimeEntry, options: Partial<AuditEvent> = {}) {
    if (!this.audit) return
    try {
      await this.audit.record({
        id: crypto.randomUUID(),
        type,
        occurredAt: this.now(),
        actorId,
        actorRole: 'COLLABORATOR',
        entityType: 'TimeEntry',
        entityId: entry.id,
        ...options,
      })
    } catch (error) {
      this.onAuditError('Não foi possível registrar a auditoria da mutação confirmada.', error)
    }
  }

  async list(query: TimeEntryListQuery): Promise<TimeEntryPage> {
    const pageSize = Math.max(1, Math.min(Math.trunc(query.pageSize), MAX_HISTORY_PAGE_SIZE))
    const offset = Math.max(0, Number.parseInt(query.cursor ?? '0', 10) || 0)
    const filters = query.filters ?? {}
    const entries = (this.read().data.entriesByCollaborator[query.collaboratorId] ?? [])
      .filter((entry) => entry.entryDate >= query.startDate && entry.entryDate <= query.endDate)
      .filter((entry) => !filters.clientName || entry.clientName.toLocaleLowerCase().includes(filters.clientName.toLocaleLowerCase()))
      .filter((entry) => !filters.projectCode || entry.projectCode.toLocaleLowerCase().includes(filters.projectCode.toLocaleLowerCase()))
      .filter((entry) => !filters.activityId || entry.activityId === filters.activityId)
      .filter((entry) => !filters.disciplineCode || entry.disciplineCode === filters.disciplineCode)
      .filter((entry) => !filters.documentTypeCode || entry.documentTypeCode === filters.documentTypeCode)
      .filter((entry) => !filters.status || (filters.status === 'ACTIVE' ? entry.status !== 'CANCELLED' : entry.status === filters.status))
      .sort((left, right) => right.entryDate.localeCompare(left.entryDate) || right.createdAt.localeCompare(left.createdAt))
    const items = entries.slice(offset, offset + pageSize)
    const nextOffset = offset + items.length
    return { items, nextCursor: nextOffset < entries.length ? String(nextOffset) : null, total: entries.length }
  }

  async listByDate(collaboratorId: string, date: string) {
    return (this.read().data.entriesByCollaborator[collaboratorId] ?? [])
      .filter((entry) => entry.entryDate === date)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  }

  async listByRange(collaboratorId: string, startDate: string, endDate: string) {
    return (this.read().data.entriesByCollaborator[collaboratorId] ?? [])
      .filter((entry) => entry.entryDate >= startDate && entry.entryDate <= endDate)
      .sort((left, right) => left.entryDate.localeCompare(right.entryDate) || left.createdAt.localeCompare(right.createdAt))
  }

  async getById(collaboratorId: string, id: string) {
    return (this.read().data.entriesByCollaborator[collaboratorId] ?? []).find((entry) => entry.id === id) ?? null
  }

  async create(collaboratorId: string, data: CreateTimeEntryData) {
    const endDate = data.endDate ?? data.entryDate
    const weekdaysOnly = data.weekdaysOnly ?? true
    const normalized = normalizeCreateData(data)
    const dates = expandTimeEntryDates(normalized.entryDate, endDate, weekdaysOnly)
    if (dates.length === 0) {
      throw new Error('O período selecionado não contém dias válidos para lançamento.')
    }
    await this.ensureMutableRange(collaboratorId, dates)
    for (const date of dates) {
      await this.ensureDateAvailable(collaboratorId, date)
    }
    const assignmentSnapshot = this.resolveAssignment(collaboratorId)
    if (!assignmentSnapshot) throw new Error('Não existe squad ativa para vincular o apontamento.')
    const readResult = this.read()
    if (!readResult.canWrite) throw new Error('Não foi possível preparar o armazenamento local para gravação.')
    const timestamp = this.now()
    const createdEntries: TimeEntry[] = dates.map((date) => ({
      id: this.createId(),
      collaboratorId,
      ...normalized,
      entryDate: date,
      assignmentSnapshot,
      status: 'PENDING',
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    }))
    const current = readResult.data.entriesByCollaborator[collaboratorId] ?? []
    readResult.data.entriesByCollaborator[collaboratorId] = [...current, ...createdEntries]
    this.writeAndValidate(readResult.data)
    await Promise.all(createdEntries.map((entry) => this.record('TIME_ENTRY_CREATED', collaboratorId, entry, { newValue: entry })))
    return createdEntries[0]
  }

  async update(collaboratorId: string, id: string, expectedVersion: number, data: CreateTimeEntryData, reason: string) {
    const editReason = reason.trim()
    if (!editReason) throw new Error('Informe o motivo da edição.')
    const normalized = normalizeCreateData(data)
    const readResult = this.read()
    if (!readResult.canWrite) throw new Error('Não foi possível preparar o armazenamento local para gravação.')
    const { entries, index, entry } = this.getOwnEntry(readResult.data, collaboratorId, id)
    this.assertVersion(entry, expectedVersion)
    if (entry.status === 'CANCELLED') throw new Error('Um apontamento cancelado não pode ser editado.')
    await this.ensureMutable(collaboratorId, entry.entryDate)
    await this.ensureMutable(collaboratorId, normalized.entryDate)
    await this.ensureDateAvailable(collaboratorId, entry.entryDate)
    if (normalized.entryDate !== entry.entryDate) await this.ensureDateAvailable(collaboratorId, normalized.entryDate)
    const updated: TimeEntry = {
      ...entry,
      ...normalized,
      lastEditReason: editReason,
      version: entry.version + 1,
      updatedAt: this.now(),
    }
    entries[index] = updated
    this.writeAndValidate(readResult.data)
    await this.record('TIME_ENTRY_EDITED', collaboratorId, updated, { previousValue: entry, newValue: updated, justification: editReason })
    return updated
  }

  async duplicate(collaborId: string, id: string, expectedVersion: number, overrides: Partial<CreateTimeEntryData>) {
    const readResult = this.read()
    if (!readResult.canWrite) throw new Error('Não foi possível preparar o armazenamento local para gravação.')
    const { entry } = this.getOwnEntry(readResult.data, collaborId, id)
    this.assertVersion(entry, expectedVersion)
    const normalized = normalizeCreateData({
      entryDate: overrides.entryDate ?? entry.entryDate,
      clientName: overrides.clientName ?? entry.clientName,
      projectCode: overrides.projectCode ?? entry.projectCode,
      contractorNumber: overrides.contractorNumber ?? entry.contractorNumber,
      ldDocument: Object.hasOwn(overrides, 'ldDocument') ? overrides.ldDocument : entry.ldDocument,
      activityId: overrides.activityId ?? entry.activityId,
      disciplineCode: overrides.disciplineCode ?? entry.disciplineCode,
      documentTypeCode: overrides.documentTypeCode ?? entry.documentTypeCode,
      durationMinutes: overrides.durationMinutes ?? entry.durationMinutes,
      details: overrides.details ?? entry.details,
    })
    await this.ensureMutable(collaborId, normalized.entryDate)
    await this.ensureDateAvailable(collaborId, entry.entryDate)
    if (normalized.entryDate !== entry.entryDate) await this.ensureDateAvailable(collaborId, normalized.entryDate)
    const assignmentSnapshot = this.resolveAssignment(collaborId)
    if (!assignmentSnapshot) throw new Error('Não existe squad ativa para vincular o apontamento.')
    const timestamp = this.now()
    const duplicate: TimeEntry = {
      id: this.createId(),
      collaboratorId: collaborId,
      ...normalized,
      assignmentSnapshot,
      status: 'PENDING',
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      sourceEntryId: entry.id,
    }
    const current = readResult.data.entriesByCollaborator[collaborId] ?? []
    readResult.data.entriesByCollaborator[collaborId] = [...current, duplicate]
    this.writeAndValidate(readResult.data)
    await this.record('TIME_ENTRY_DUPLICATED', collaborId, duplicate, { relatedEntityId: entry.id, newValue: duplicate })
    return duplicate
  }

  async cancel(collaboratorId: string, id: string, expectedVersion: number, reason: string) {
    const cancelReason = reason.trim()
    if (!cancelReason) throw new Error('Informe o motivo do cancelamento.')
    const readResult = this.read()
    if (!readResult.canWrite) throw new Error('Não foi possível preparar o armazenamento local para gravação.')
    const { entries, index, entry } = this.getOwnEntry(readResult.data, collaboratorId, id)
    this.assertVersion(entry, expectedVersion)
    if (entry.status === 'CANCELLED') throw new Error('O apontamento já está cancelado.')
    await this.ensureMutable(collaboratorId, entry.entryDate)
    await this.ensureDateAvailable(collaboratorId, entry.entryDate)
    const timestamp = this.now()
    const cancelled: TimeEntry = {
      ...entry,
      status: 'CANCELLED',
      cancelReason,
      cancelledAt: timestamp,
      updatedAt: timestamp,
      version: entry.version + 1,
    }
    entries[index] = cancelled
    this.writeAndValidate(readResult.data)
    await this.record('TIME_ENTRY_CANCELLED', collaboratorId, cancelled, { previousValue: entry, newValue: cancelled, justification: cancelReason })
    return cancelled
  }

  async getDailySummary(collaboratorId: string, date: string, workloadVersions: WorkloadVersion[]) {
    return calculateDaySummary({
      collaboratorId,
      date,
      today: date,
      entries: await this.listByDate(collaboratorId, date),
      events: [],
      timeOffRequests: [],
      workloadVersions,
    })
  }
}

export const timeEntryService = new LocalStorageTimeEntryService({
  storage: createBrowserStorage(),
  resolveAssignment: (collaboratorId) => profileService.resolveAssignment(collaboratorId),
  mutationPolicy: dayApprovalService,
  dateGuard: entryDateAvailabilityService,
  audit: auditService,
})
