import type { SupabaseClient } from '@supabase/supabase-js'
import { MAX_HISTORY_PAGE_SIZE } from '../../../config/business'
import { calculateDaySummary } from '../../calendar/domain'
import type { DailySummary } from '../../calendar/types'
import type { AuditEvent } from '../../audit/types'
import type { AssignmentSnapshot } from '../../squads/types'
import type { WorkloadVersion } from '../../workloads/types'
import { corporateDataError, listCorporatePeople } from '../../corporate/corporateData'
import { expandTimeEntryDates } from '../domain'
import type { CreateTimeEntryData, DisciplineCode, LdDocumentSnapshot, TimeEntry, TimeEntryStatus } from '../types'
import type {
  AuditRecorder,
  EntryDateGuard,
  EntryMutationPolicy,
  TimeEntryListQuery,
  TimeEntryPage,
  TimeEntryService,
} from './timeEntryService'
import { normalizeCreateData } from './timeEntryValidation'

export const BANCO1_TIME_ENTRIES_TABLE = 'banco1_time_entries'

/** Linha da tabela public.banco1_time_entries. */
export type Banco1TimeEntryRow = {
  id: string
  collaborator_id: string
  entry_date: string
  client_name: string
  project_code: string
  contractor_number: string | null
  ld_document: LdDocumentSnapshot | null
  activity_id: string
  discipline_code: string
  document_type_code: string
  duration_minutes: number
  details: string | null
  team_id: string | null
  assignment_snapshot: AssignmentSnapshot | null
  status: string
  version: number
  last_edit_reason: string | null
  source_entry_id: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  rejection_reason: string | null
  decided_at: string | null
  decided_by: string | null
  created_at: string
  updated_at: string
}

const STATUSES = new Set<TimeEntryStatus>(['PENDING', 'APPROVED', 'REJECTED', 'ACTIVE', 'CANCELLED'])

export function timeEntryFromRow(row: Banco1TimeEntryRow): TimeEntry {
  return {
    id: row.id,
    collaboratorId: row.collaborator_id,
    entryDate: row.entry_date,
    clientName: row.client_name,
    projectCode: row.project_code,
    contractorNumber: row.contractor_number ?? undefined,
    ldDocument: row.ld_document ?? undefined,
    activityId: row.activity_id,
    disciplineCode: row.discipline_code as DisciplineCode,
    documentTypeCode: row.document_type_code,
    durationMinutes: Number(row.duration_minutes),
    details: row.details ?? '',
    assignmentSnapshot: row.assignment_snapshot ?? null,
    status: STATUSES.has(row.status as TimeEntryStatus) ? row.status as TimeEntryStatus : 'PENDING',
    version: Number(row.version),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastEditReason: row.last_edit_reason ?? undefined,
    sourceEntryId: row.source_entry_id ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
    cancelReason: row.cancel_reason ?? undefined,
  }
}

function contentColumns(data: CreateTimeEntryData) {
  return {
    entry_date: data.entryDate,
    client_name: data.clientName,
    project_code: data.projectCode,
    contractor_number: data.contractorNumber?.trim() ? data.contractorNumber.trim() : null,
    ld_document: data.ldDocument ?? null,
    activity_id: data.activityId,
    discipline_code: data.disciplineCode,
    document_type_code: data.documentTypeCode,
    duration_minutes: data.durationMinutes,
    details: data.details,
  }
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

type Dependencies = {
  getClient: () => SupabaseClient | null
  mutationPolicy?: EntryMutationPolicy
  dateGuard?: EntryDateGuard
  audit?: AuditRecorder
  resolveAssignment?: (collaboratorId: string) => Promise<AssignmentSnapshot | null>
  now?: () => string
  onAuditError?: (message: string, error: unknown) => void
}

/** Equipe real do colaborador (tabela teams) no formato usado pelas telas. */
export async function resolveCorporateAssignment(collaboratorId: string): Promise<AssignmentSnapshot | null> {
  const people = await listCorporatePeople().catch(() => [])
  const person = people.find((item) => item.id === collaboratorId)
  if (!person?.teamId) return null
  return {
    squadId: person.teamId,
    squadName: person.teamName ?? 'Equipe',
    supervisorId: person.supervisorId ?? '',
    supervisorName: person.supervisorName ?? '',
  }
}

/**
 * Apontamentos do Banco 1 gravados no Supabase (tabela banco1_time_entries).
 * A RLS e o gatilho do banco garantem dono, versão e decisões; aqui ficam as mesmas
 * validações de formulário do armazenamento local.
 */
export class SupabaseTimeEntryService implements TimeEntryService {
  private readonly getClient: () => SupabaseClient | null
  private readonly mutationPolicy: EntryMutationPolicy
  private readonly dateGuard: EntryDateGuard
  private readonly audit?: AuditRecorder
  private readonly resolveAssignment: (collaboratorId: string) => Promise<AssignmentSnapshot | null>
  private readonly now: () => string
  private readonly onAuditError: (message: string, error: unknown) => void

  constructor({ getClient, mutationPolicy, dateGuard, audit, resolveAssignment, now, onAuditError }: Dependencies) {
    this.getClient = getClient
    this.mutationPolicy = mutationPolicy ?? { canMutate: async () => true }
    this.dateGuard = dateGuard ?? { getBlock: async () => ({ blocked: false }) }
    this.audit = audit
    this.resolveAssignment = resolveAssignment ?? resolveCorporateAssignment
    this.now = now ?? (() => new Date().toISOString())
    this.onAuditError = onAuditError ?? ((message, error) => console.error(message, error))
  }

  private client() {
    const client = this.getClient()
    if (!client) throw new Error('Sessão corporativa indisponível. Entre novamente.')
    return client
  }

  private table() {
    return this.client().from(BANCO1_TIME_ENTRIES_TABLE)
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

  private async fetchOwn(collaboratorId: string, id: string) {
    const { data, error } = await this.table().select('*').eq('id', id).eq('collaborator_id', collaboratorId).maybeSingle()
    if (error) throw corporateDataError(error, 'Não foi possível carregar o apontamento.')
    return data ? timeEntryFromRow(data as Banco1TimeEntryRow) : null
  }

  /** Explica por que uma atualização condicionada à versão não alterou nenhuma linha. */
  private async conflictError(collaboratorId: string, id: string, expectedVersion: number) {
    const current = await this.fetchOwn(collaboratorId, id)
    if (!current) return new Error('Apontamento não encontrado para este colaborador.')
    if (current.version !== expectedVersion) return new Error('A versão do apontamento foi alterada. Recarregue os dados.')
    if (current.status === 'APPROVED') return new Error('Um apontamento aprovado não pode ser alterado.')
    if (current.status === 'CANCELLED') return new Error('Um apontamento cancelado não pode ser alterado.')
    return new Error('Não foi possível salvar o apontamento.')
  }

  async list(query: TimeEntryListQuery): Promise<TimeEntryPage> {
    const pageSize = Math.max(1, Math.min(Math.trunc(query.pageSize), MAX_HISTORY_PAGE_SIZE))
    const offset = Math.max(0, Number.parseInt(query.cursor ?? '0', 10) || 0)
    const filters = query.filters ?? {}
    let request = this.table()
      .select('*', { count: 'exact' })
      .eq('collaborator_id', query.collaboratorId)
      .gte('entry_date', query.startDate)
      .lte('entry_date', query.endDate)
    if (filters.clientName) request = request.ilike('client_name', `%${escapeLike(filters.clientName)}%`)
    if (filters.projectCode) request = request.ilike('project_code', `%${escapeLike(filters.projectCode)}%`)
    if (filters.activityId) request = request.eq('activity_id', filters.activityId)
    if (filters.disciplineCode) request = request.eq('discipline_code', filters.disciplineCode)
    if (filters.documentTypeCode) request = request.eq('document_type_code', filters.documentTypeCode)
    if (filters.status) request = filters.status === 'ACTIVE' ? request.neq('status', 'CANCELLED') : request.eq('status', filters.status)
    const { data, error, count } = await request
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1)
    if (error) throw corporateDataError(error, 'Não foi possível carregar o histórico de apontamentos.')
    const items = ((data ?? []) as Banco1TimeEntryRow[]).map(timeEntryFromRow)
    const total = count ?? offset + items.length
    const nextOffset = offset + items.length
    return { items, nextCursor: nextOffset < total ? String(nextOffset) : null, total }
  }

  async listByDate(collaboratorId: string, date: string) {
    return this.listByRange(collaboratorId, date, date)
  }

  async listByRange(collaboratorId: string, startDate: string, endDate: string) {
    const { data, error } = await this.table()
      .select('*')
      .eq('collaborator_id', collaboratorId)
      .gte('entry_date', startDate)
      .lte('entry_date', endDate)
      .order('entry_date', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) throw corporateDataError(error, 'Não foi possível carregar os apontamentos.')
    return ((data ?? []) as Banco1TimeEntryRow[]).map(timeEntryFromRow)
  }

  async getById(collaboratorId: string, id: string) {
    return this.fetchOwn(collaboratorId, id)
  }

  async create(collaboratorId: string, data: CreateTimeEntryData) {
    const endDate = data.endDate ?? data.entryDate
    const weekdaysOnly = data.weekdaysOnly ?? true
    const normalized = normalizeCreateData(data)
    const dates = expandTimeEntryDates(normalized.entryDate, endDate, weekdaysOnly)
    if (dates.length === 0) throw new Error('O período selecionado não contém dias válidos para lançamento.')
    await this.ensureMutableRange(collaboratorId, dates)
    for (const date of dates) await this.ensureDateAvailable(collaboratorId, date)
    const assignmentSnapshot = await this.resolveAssignment(collaboratorId)
    const rows = dates.map((date) => ({
      collaborator_id: collaboratorId,
      ...contentColumns({ ...normalized, entryDate: date }),
      assignment_snapshot: assignmentSnapshot,
      status: 'PENDING',
    }))
    const { data: inserted, error } = await this.table().insert(rows).select('*')
    if (error) throw corporateDataError(error, 'Não foi possível salvar o apontamento no banco de dados.')
    const created = ((inserted ?? []) as Banco1TimeEntryRow[]).map(timeEntryFromRow)
      .sort((left, right) => left.entryDate.localeCompare(right.entryDate))
    if (created.length === 0) throw new Error('O banco de dados não confirmou o apontamento.')
    await Promise.all(created.map((entry) => this.record('TIME_ENTRY_CREATED', collaboratorId, entry, { newValue: entry })))
    return created[0]
  }

  async update(collaboratorId: string, id: string, expectedVersion: number, data: CreateTimeEntryData, reason: string) {
    const editReason = reason.trim()
    if (!editReason) throw new Error('Informe o motivo da edição.')
    const normalized = normalizeCreateData(data)
    const current = await this.fetchOwn(collaboratorId, id)
    if (!current) throw new Error('Apontamento não encontrado para este colaborador.')
    if (current.version !== expectedVersion) throw new Error('A versão do apontamento foi alterada. Recarregue os dados.')
    if (current.status === 'CANCELLED') throw new Error('Um apontamento cancelado não pode ser editado.')
    await this.ensureMutable(collaboratorId, current.entryDate)
    await this.ensureMutable(collaboratorId, normalized.entryDate)
    await this.ensureDateAvailable(collaboratorId, current.entryDate)
    if (normalized.entryDate !== current.entryDate) await this.ensureDateAvailable(collaboratorId, normalized.entryDate)
    const { data: rows, error } = await this.table()
      .update({ ...contentColumns(normalized), last_edit_reason: editReason })
      .eq('id', id)
      .eq('collaborator_id', collaboratorId)
      .eq('version', expectedVersion)
      .select('*')
    if (error) throw corporateDataError(error, 'Não foi possível salvar a edição no banco de dados.')
    const row = (rows ?? [])[0] as Banco1TimeEntryRow | undefined
    if (!row) throw await this.conflictError(collaboratorId, id, expectedVersion)
    const updated = timeEntryFromRow(row)
    await this.record('TIME_ENTRY_EDITED', collaboratorId, updated, { previousValue: current, newValue: updated, justification: editReason })
    return updated
  }

  async duplicate(collaboratorId: string, id: string, expectedVersion: number, overrides: Partial<CreateTimeEntryData>) {
    const entry = await this.fetchOwn(collaboratorId, id)
    if (!entry) throw new Error('Apontamento não encontrado para este colaborador.')
    if (entry.version !== expectedVersion) throw new Error('A versão do apontamento foi alterada. Recarregue os dados.')
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
    await this.ensureMutable(collaboratorId, normalized.entryDate)
    await this.ensureDateAvailable(collaboratorId, entry.entryDate)
    if (normalized.entryDate !== entry.entryDate) await this.ensureDateAvailable(collaboratorId, normalized.entryDate)
    const assignmentSnapshot = await this.resolveAssignment(collaboratorId)
    const { data: rows, error } = await this.table()
      .insert({
        collaborator_id: collaboratorId,
        ...contentColumns(normalized),
          assignment_snapshot: assignmentSnapshot,
        status: 'PENDING',
        source_entry_id: entry.id,
      })
      .select('*')
    if (error) throw corporateDataError(error, 'Não foi possível duplicar o apontamento no banco de dados.')
    const row = (rows ?? [])[0] as Banco1TimeEntryRow | undefined
    if (!row) throw new Error('O banco de dados não confirmou o apontamento duplicado.')
    const duplicate = timeEntryFromRow(row)
    await this.record('TIME_ENTRY_DUPLICATED', collaboratorId, duplicate, { relatedEntityId: entry.id, newValue: duplicate })
    return duplicate
  }

  async cancel(collaboratorId: string, id: string, expectedVersion: number, reason: string) {
    const cancelReason = reason.trim()
    if (!cancelReason) throw new Error('Informe o motivo do cancelamento.')
    const current = await this.fetchOwn(collaboratorId, id)
    if (!current) throw new Error('Apontamento não encontrado para este colaborador.')
    if (current.version !== expectedVersion) throw new Error('A versão do apontamento foi alterada. Recarregue os dados.')
    if (current.status === 'CANCELLED') throw new Error('O apontamento já está cancelado.')
    await this.ensureMutable(collaboratorId, current.entryDate)
    await this.ensureDateAvailable(collaboratorId, current.entryDate)
    const { data: rows, error } = await this.table()
      .update({ status: 'CANCELLED', cancel_reason: cancelReason })
      .eq('id', id)
      .eq('collaborator_id', collaboratorId)
      .eq('version', expectedVersion)
      .select('*')
    if (error) throw corporateDataError(error, 'Não foi possível cancelar o apontamento no banco de dados.')
    const row = (rows ?? [])[0] as Banco1TimeEntryRow | undefined
    if (!row) throw await this.conflictError(collaboratorId, id, expectedVersion)
    const cancelled = timeEntryFromRow(row)
    await this.record('TIME_ENTRY_CANCELLED', collaboratorId, cancelled, { previousValue: current, newValue: cancelled, justification: cancelReason })
    return cancelled
  }

  async getDailySummary(collaboratorId: string, date: string, workloadVersions: WorkloadVersion[]): Promise<DailySummary> {
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
