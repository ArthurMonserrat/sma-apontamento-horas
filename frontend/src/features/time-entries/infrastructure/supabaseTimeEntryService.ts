import { calculateDaySummary } from '../../calendar/domain'
import type { DailySummary } from '../../calendar/types'
import type { AssignmentSnapshot } from '../../squads/types'
import type { WorkloadVersion } from '../../workloads/types'
import type { CreateTimeEntryData, TimeEntry, TimeEntryStatus } from '../types'
import type { TimeEntryFilters, TimeEntryListQuery, TimeEntryPage, TimeEntryService } from './timeEntryService'

type QueryResult<T> = { data: T | null, error: { message: string } | null, count?: number | null }

export type SupabaseQuery = {
  select: (...args: unknown[]) => SupabaseQuery
  eq: (...args: unknown[]) => SupabaseQuery
  gte: (...args: unknown[]) => SupabaseQuery
  lte: (...args: unknown[]) => SupabaseQuery
  order: (...args: unknown[]) => SupabaseQuery
  range: (...args: unknown[]) => SupabaseQuery
  insert: (...args: unknown[]) => SupabaseQuery
  update: (...args: unknown[]) => SupabaseQuery
  upsert: (...args: unknown[]) => SupabaseQuery
  maybeSingle: (...args: unknown[]) => SupabaseQuery
  single: (...args: unknown[]) => SupabaseQuery
  then: PromiseLike<QueryResult<unknown>>['then']
}

export type SupabaseDataClient = {
  from: (table: string) => SupabaseQuery
}

type DatabaseStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

type DatabaseTimeEntry = {
  id: string
  profile_id: string
  date: string
  duration_minutes: number
  client_name: string | null
  project_code: string
  contractor_number: string | null
  ld_document: TimeEntry['ldDocument'] | null
  activity_id: string | null
  discipline_code: TimeEntry['disciplineCode'] | null
  document_type_code: string | null
  assignment_snapshot: AssignmentSnapshot | null
  description: string | null
  status: DatabaseStatus
  version: number
  created_at: string
  updated_at: string
  last_edit_reason: string | null
  source_entry_id: string | null
  cancelled_at: string | null
  cancel_reason: string | null
}

const statusToDb: Record<TimeEntryStatus, DatabaseStatus> = {
  PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected', ACTIVE: 'pending', CANCELLED: 'cancelled',
}

const statusFromDb: Record<DatabaseTimeEntry['status'], TimeEntryStatus> = {
  pending: 'PENDING', approved: 'APPROVED', rejected: 'REJECTED', cancelled: 'CANCELLED',
}

function dataError(error: { message: string } | null, fallback: string) {
  if (error) throw new Error(error.message || fallback)
}

function mapRow(row: DatabaseTimeEntry): TimeEntry {
  return {
    id: row.id,
    collaboratorId: row.profile_id,
    entryDate: row.date,
    clientName: row.client_name ?? '',
    projectCode: row.project_code,
    contractorNumber: row.contractor_number ?? undefined,
    ldDocument: row.ld_document ?? undefined,
    activityId: row.activity_id ?? '',
    disciplineCode: row.discipline_code ?? '—',
    documentTypeCode: row.document_type_code ?? '—',
    durationMinutes: row.duration_minutes,
    details: row.description ?? '',
    assignmentSnapshot: row.assignment_snapshot,
    status: statusFromDb[row.status],
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastEditReason: row.last_edit_reason ?? undefined,
    sourceEntryId: row.source_entry_id ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
    cancelReason: row.cancel_reason ?? undefined,
  }
}

function filters(query: SupabaseQuery, values: TimeEntryFilters | undefined) {
  let next = query
  if (values?.clientName) next = next.eq('client_name', values.clientName)
  if (values?.projectCode) next = next.eq('project_code', values.projectCode)
  if (values?.activityId) next = next.eq('activity_id', values.activityId)
  if (values?.disciplineCode) next = next.eq('discipline_code', values.disciplineCode)
  if (values?.documentTypeCode) next = next.eq('document_type_code', values.documentTypeCode)
  if (values?.status) next = next.eq('status', statusToDb[values.status])
  return next
}

export class SupabaseTimeEntryService implements TimeEntryService {
  private readonly client: SupabaseDataClient

  constructor(client: SupabaseDataClient) {
    this.client = client
  }

  async list(query: TimeEntryListQuery): Promise<TimeEntryPage> {
    const pageSize = Math.max(1, Math.min(Math.trunc(query.pageSize), 100))
    const offset = Math.max(0, Number.parseInt(query.cursor ?? '0', 10) || 0)
    let request = this.client.from('time_entries').select('*', { count: 'exact' })
      .eq('profile_id', query.collaboratorId).gte('date', query.startDate).lte('date', query.endDate)
      .order('date', { ascending: false }).order('created_at', { ascending: false })
    request = filters(request, query.filters).range(offset, offset + pageSize - 1)
    const result = await request as unknown as QueryResult<DatabaseTimeEntry[]>
    dataError(result.error, 'Não foi possível consultar os apontamentos.')
    const items = (result.data ?? []).map(mapRow)
    return { items, nextCursor: items.length === pageSize ? String(offset + items.length) : null, total: result.count ?? items.length }
  }

  async listByDate(collaboratorId: string, date: string) {
    return (await this.list({ collaboratorId, startDate: date, endDate: date, pageSize: 100 })).items
  }

  async listByRange(collaboratorId: string, startDate: string, endDate: string) {
    return (await this.list({ collaboratorId, startDate, endDate, pageSize: 100 })).items
  }

  async getById(collaboratorId: string, id: string) {
    const result = await this.client.from('time_entries').select('*').eq('id', id).eq('profile_id', collaboratorId).maybeSingle() as unknown as QueryResult<DatabaseTimeEntry>
    dataError(result.error, 'Não foi possível consultar o apontamento.')
    return result.data ? mapRow(result.data) : null
  }

  async create(collaboratorId: string, data: CreateTimeEntryData) {
    const payload = {
      profile_id: collaboratorId,
      date: data.entryDate,
      start_time: null,
      end_time: null,
      duration_minutes: data.durationMinutes,
      client_name: data.clientName.trim(),
      project_code: data.projectCode.trim(),
      contractor_number: data.contractorNumber?.trim() || null,
      ld_document: data.ldDocument ?? null,
      activity_id: data.activityId,
      discipline_code: data.disciplineCode,
      document_type_code: data.documentTypeCode,
      description: data.details.trim() || null,
      assignment_snapshot: null,
      status: 'pending',
      version: 1,
      offline_sync_id: crypto.randomUUID(),
    }
    const result = await this.client.from('time_entries').insert([payload]).select('*').single() as unknown as QueryResult<DatabaseTimeEntry>
    dataError(result.error, 'Não foi possível persistir o apontamento.')
    if (!result.data) throw new Error('O banco não retornou o apontamento criado.')
    return mapRow(result.data)
  }

  async update(collaboratorId: string, id: string, expectedVersion: number, data: CreateTimeEntryData, reason: string) {
    if (!reason.trim()) throw new Error('Informe o motivo da edição.')
    const result = await this.client.from('time_entries').update({
      date: data.entryDate,
      duration_minutes: data.durationMinutes,
      client_name: data.clientName.trim(),
      project_code: data.projectCode.trim(),
      contractor_number: data.contractorNumber?.trim() || null,
      ld_document: data.ldDocument ?? null,
      activity_id: data.activityId,
      discipline_code: data.disciplineCode,
      document_type_code: data.documentTypeCode,
      description: data.details.trim() || null,
      last_edit_reason: reason.trim(),
      version: expectedVersion + 1,
    }).eq('id', id).eq('profile_id', collaboratorId).eq('version', expectedVersion).select('*').maybeSingle() as unknown as QueryResult<DatabaseTimeEntry>
    dataError(result.error, 'Não foi possível atualizar o apontamento.')
    if (!result.data) throw new Error('O apontamento foi alterado ou não pode mais ser editado.')
    return mapRow(result.data)
  }

  async duplicate(collaboratorId: string, id: string, expectedVersion: number, overrides: Partial<CreateTimeEntryData>) {
    const source = await this.getById(collaboratorId, id)
    if (!source || source.version !== expectedVersion) throw new Error('O apontamento de origem está desatualizado.')
    return this.create(collaboratorId, {
      entryDate: overrides.entryDate ?? source.entryDate,
      clientName: overrides.clientName ?? source.clientName,
      projectCode: overrides.projectCode ?? source.projectCode,
      contractorNumber: overrides.contractorNumber ?? source.contractorNumber,
      ldDocument: Object.hasOwn(overrides, 'ldDocument') ? overrides.ldDocument : source.ldDocument,
      activityId: overrides.activityId ?? source.activityId,
      disciplineCode: overrides.disciplineCode ?? source.disciplineCode,
      documentTypeCode: overrides.documentTypeCode ?? source.documentTypeCode,
      durationMinutes: overrides.durationMinutes ?? source.durationMinutes,
      details: overrides.details ?? source.details,
    })
  }

  async cancel(collaboratorId: string, id: string, expectedVersion: number, reason: string) {
    if (!reason.trim()) throw new Error('Informe o motivo do cancelamento.')
    const result = await this.client.from('time_entries').update({
      status: 'cancelled', cancel_reason: reason.trim(), cancelled_at: new Date().toISOString(), version: expectedVersion + 1,
    }).eq('id', id).eq('profile_id', collaboratorId).eq('version', expectedVersion).eq('status', 'pending').select('*').maybeSingle() as unknown as QueryResult<DatabaseTimeEntry>
    dataError(result.error, 'Não foi possível cancelar o apontamento.')
    if (!result.data) throw new Error('O apontamento foi alterado, aprovado ou não pode mais ser cancelado.')
    return mapRow(result.data)
  }

  async getDailySummary(collaboratorId: string, date: string, workloadVersions: WorkloadVersion[]): Promise<DailySummary> {
    return calculateDaySummary({ collaboratorId, date, today: date, entries: await this.listByDate(collaboratorId, date), events: [], timeOffRequests: [], workloadVersions })
  }
}
