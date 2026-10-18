import type { SupabaseDataClient, SupabaseQuery } from '../../time-entries/infrastructure/supabaseTimeEntryService'
import type { SupervisorDashboardSummary, SupervisorPendingEntry, SupervisorRequestSummary, SupervisorTimeOffRequest } from '../types'
import type { SupervisorService } from './supervisorService'

type RpcClient = SupabaseDataClient & {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown, error: { message: string } | null }>
}

type EntryRow = {
  id: string
  profile_id: string
  date: string
  project_code: string
  duration_minutes: number
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  description: string | null
  activity_id: string | null
  assignment_snapshot: SupervisorPendingEntry['assignmentSnapshot']
  version: number
  cancel_reason: string | null
  rejection_reason?: string | null
  decided_at?: string | null
  decided_by?: string | null
  profiles?: { full_name?: string | null } | null
}

const mapStatus: Record<EntryRow['status'], SupervisorPendingEntry['status']> = {
  pending: 'PENDING', approved: 'APPROVED', rejected: 'REJECTED', cancelled: 'REJECTED',
}

function throwIfError(error: { message: string } | null, fallback: string) {
  if (error) throw new Error(error.message || fallback)
}

function mapEntry(row: EntryRow): SupervisorPendingEntry {
  return {
    id: row.id,
    collaboratorId: row.profile_id,
    collaboratorName: row.profiles?.full_name ?? row.profile_id,
    entryDate: row.date,
    projectCode: row.project_code,
    durationMinutes: row.duration_minutes,
    status: mapStatus[row.status],
    activityName: row.activity_id ?? undefined,
    details: row.description ?? undefined,
    assignmentSnapshot: row.assignment_snapshot,
    rejectionReason: row.rejection_reason ?? (row.status === 'cancelled' ? row.cancel_reason ?? undefined : undefined),
    decidedAt: row.decided_at ?? undefined,
    decidedBy: row.decided_by ?? undefined,
  }
}

async function readRows(query: SupabaseQuery): Promise<EntryRow[]> {
  const result = await query as unknown as { data: EntryRow[] | null, error: { message: string } | null }
  throwIfError(result.error, 'Não foi possível consultar os apontamentos da equipe.')
  return result.data ?? []
}

export class SupabaseSupervisorService implements SupervisorService {
  private readonly client: RpcClient

  constructor(client: RpcClient) {
    this.client = client
  }

  async listEntries() {
    const rows = await readRows(this.client.from('time_entries').select('*, profiles:profile_id(full_name)').order('date', { ascending: false }))
    return rows.map(mapEntry)
  }

  async listEscalatedEntries() {
    return (await this.listEntries()).filter((entry) => entry.status === 'PENDING')
  }

  async listCollaborators() {
    const result = await this.client.from('profiles').select('id,full_name').eq('active', true) as unknown as { data: Array<{ id: string, full_name: string }> | null, error: { message: string } | null }
    throwIfError(result.error, 'Não foi possível consultar os colaboradores da equipe.')
    return (result.data ?? []).map((profile) => ({ id: profile.id, name: profile.full_name }))
  }

  private async decide(entryId: string, decision: 'approved' | 'rejected', reason: string | null) {
    const result = await this.client.rpc('decide_time_entry', {
      target_entry_id: entryId,
      expected_version: undefined,
      decision,
      rejection_reason: reason,
    })
    throwIfError(result.error, 'Não foi possível persistir a decisão do supervisor.')
    const row = Array.isArray(result.data) ? result.data[0] : result.data
    if (!row) throw new Error('O banco não retornou a decisão persistida.')
    return mapEntry(row as EntryRow)
  }

  approve(entryId: string, _supervisorId: string) {
    return this.decide(entryId, 'approved', null)
  }

  approveMany(entryIds: string[], supervisorId: string) {
    return Promise.all(entryIds.map((entryId) => this.approve(entryId, supervisorId)))
  }

  approveEscalated(entryId: string, directorId: string) {
    return this.approve(entryId, directorId)
  }

  reject(entryId: string, _supervisorId: string, reason: string) {
    const normalized = reason.trim()
    if (!normalized) return Promise.reject(new Error('Informe o motivo da rejeição.'))
    return this.decide(entryId, 'rejected', normalized)
  }

  rejectMany(entryIds: string[], supervisorId: string, reason: string) {
    return Promise.all(entryIds.map((entryId) => this.reject(entryId, supervisorId, reason)))
  }

  async listTimeOffRequests(_supervisorId: string): Promise<SupervisorTimeOffRequest[]> {
    return []
  }

  approveTimeOffRequest(_requestId: string, _supervisorId: string): Promise<SupervisorTimeOffRequest> {
    return Promise.reject(new Error('A persistência de folgas corporativas ainda não está disponível.'))
  }

  rejectTimeOffRequest(_requestId: string, _supervisorId: string, _reason: string): Promise<SupervisorTimeOffRequest> {
    return Promise.reject(new Error('A persistência de folgas corporativas ainda não está disponível.'))
  }

  async getSummary(): Promise<SupervisorDashboardSummary> {
    const entries = await this.listEntries()
    return {
      pending: entries.filter((entry) => entry.status === 'PENDING').length,
      approved: entries.filter((entry) => entry.status === 'APPROVED').length,
      rejected: entries.filter((entry) => entry.status === 'REJECTED').length,
    }
  }

  async getRequestSummary(_supervisorId: string): Promise<SupervisorRequestSummary> {
    return { pending: 0, approved: 0, rejected: 0 }
  }
}
