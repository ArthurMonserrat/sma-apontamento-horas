import type { SupabaseClient } from '@supabase/supabase-js'
import { corporateDataError, getCorporateUserId, listCorporatePeople, type CorporatePerson } from '../../corporate/corporateData'
import { BANCO1_TIME_ENTRIES_TABLE, type Banco1TimeEntryRow } from '../../time-entries/infrastructure/supabaseTimeEntryService'
import { getDaysUntilMonthClosing } from '../../../shared/lib/date'
import type { SupervisorDashboardSummary, SupervisorPendingEntry, SupervisorRequestSummary, SupervisorTimeOffRequest } from '../types'
import type { TimeOffRequest } from '../../time-off/types'
import type { SupabaseTimeOffService } from '../../time-off/infrastructure/supabaseTimeOffService'

function toSupervisorTimeOff(request: TimeOffRequest): SupervisorTimeOffRequest {
  return {
    id: request.id,
    collaboratorId: request.collaboratorId,
    collaboratorName: request.collaboratorName ?? 'Colaborador',
    absenceType: request.absenceType ?? 'Folga',
    startDate: request.startDate ?? request.date,
    endDate: request.endDate ?? request.date,
    date: request.date,
    reason: request.reason,
    status: request.status,
    rejectionReason: request.rejectionReason ?? request.cancellationReason,
    decidedAt: request.decidedAt,
  }
}
import type { SupervisorService } from './supervisorService'

type TimeOffSource = Pick<SupabaseTimeOffService, 'listVisible' | 'decide'>

type Dependencies = {
  getClient: () => SupabaseClient | null
  /** Ausências no banco de dados (banco1_time_off_requests). */
  timeOff: TimeOffSource
  listPeople?: () => Promise<CorporatePerson[]>
  getUserId?: () => string | null
  daysUntilClosing?: () => number
}

function approvalStatus(row: Banco1TimeEntryRow): SupervisorPendingEntry['status'] {
  if (row.status === 'APPROVED') return 'APPROVED'
  if (row.status === 'REJECTED' || row.status === 'CANCELLED') return 'REJECTED'
  return 'PENDING'
}

/**
 * Aprovação de apontamentos do Banco 1 pelo banco de dados.
 * A lista vem da tabela banco1_time_entries (a RLS entrega a equipe do supervisor ou tudo para a diretoria)
 * e as decisões passam pela função banco1_decide_time_entries.
 */
export class SupabaseSupervisorService implements SupervisorService {
  private readonly getClient: () => SupabaseClient | null
  private readonly timeOff: TimeOffSource
  private readonly listPeople: () => Promise<CorporatePerson[]>
  private readonly getUserId: () => string | null
  private readonly daysUntilClosing: () => number

  constructor({ getClient, timeOff, listPeople, getUserId, daysUntilClosing }: Dependencies) {
    this.getClient = getClient
    this.timeOff = timeOff
    this.listPeople = listPeople ?? listCorporatePeople
    this.getUserId = getUserId ?? getCorporateUserId
    this.daysUntilClosing = daysUntilClosing ?? getDaysUntilMonthClosing
  }

  private client() {
    const client = this.getClient()
    if (!client) throw new Error('Sessão corporativa indisponível. Entre novamente.')
    return client
  }

  private async toEntries(rows: Banco1TimeEntryRow[]) {
    const people = await this.listPeople().catch(() => [] as CorporatePerson[])
    const names = new Map(people.map((person) => [person.id, person.name]))
    const daysUntilClosing = this.daysUntilClosing()
    return rows.map<SupervisorPendingEntry>((row) => {
      const status = approvalStatus(row)
      return {
        id: row.id,
        collaboratorId: row.collaborator_id,
        collaboratorName: names.get(row.collaborator_id) ?? 'Colaborador',
        entryDate: row.entry_date,
        projectCode: row.project_code,
        durationMinutes: Number(row.duration_minutes),
        status,
        activityName: row.activity_id,
        details: row.details ?? undefined,
        assignmentSnapshot: row.assignment_snapshot,
        rejectionReason: row.status === 'CANCELLED'
          ? row.cancel_reason ?? 'Apontamento cancelado pelo colaborador.'
          : row.rejection_reason ?? undefined,
        decidedAt: row.decided_at ?? undefined,
        decidedBy: row.decided_by ?? undefined,
        escalated: daysUntilClosing <= 1 && status === 'PENDING',
      }
    })
  }

  private async decide(entryIds: string[], decision: 'APPROVED' | 'REJECTED', reason?: string) {
    const ids = Array.from(new Set(entryIds.filter(Boolean)))
    if (ids.length === 0) return []
    const { data, error } = await this.client().rpc('banco1_decide_time_entries', {
      entry_ids: ids,
      decision,
      reason: reason ?? null,
    })
    if (error) throw corporateDataError(error, decision === 'APPROVED' ? 'Não foi possível aprovar o apontamento.' : 'Não foi possível rejeitar o apontamento.')
    const rows = (data ?? []) as Banco1TimeEntryRow[]
    if (rows.length !== ids.length) throw new Error('Apontamento não encontrado.')
    const entries = await this.toEntries(rows)
    const byId = new Map(entries.map((entry) => [entry.id, entry]))
    return ids.map((id) => byId.get(id)!).filter(Boolean)
  }

  async listEntries() {
    const userId = this.getUserId()
    const { data, error } = await this.client()
      .from(BANCO1_TIME_ENTRIES_TABLE)
      .select('*')
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) throw corporateDataError(error, 'Não foi possível carregar os apontamentos da equipe.')
    // Os próprios apontamentos não entram na fila de aprovação de quem aprova.
    const rows = ((data ?? []) as Banco1TimeEntryRow[]).filter((row) => row.collaborator_id !== userId)
    const entries = await this.toEntries(rows)
    return entries.sort((left, right) => right.entryDate.localeCompare(left.entryDate) || left.collaboratorName.localeCompare(right.collaboratorName))
  }

  async listEscalatedEntries() {
    return (await this.listEntries()).filter((entry) => entry.status === 'PENDING' && entry.escalated)
  }

  async listCollaborators() {
    const userId = this.getUserId()
    const people = await this.listPeople()
    return people.filter((person) => person.id !== userId).map((person) => ({ id: person.id, name: person.name }))
  }

  async approve(entryId: string, _supervisorId: string) {
    const [entry] = await this.decide([entryId], 'APPROVED')
    if (!entry) throw new Error('Apontamento não encontrado.')
    return entry
  }

  approveMany(entryIds: string[], _supervisorId: string) {
    return this.decide(entryIds, 'APPROVED')
  }

  async approveEscalated(entryId: string, directorId: string) {
    const escalated = await this.listEscalatedEntries()
    if (!escalated.some((entry) => entry.id === entryId)) throw new Error('Apontamento não está na fila escalada.')
    return this.approve(entryId, directorId)
  }

  async reject(entryId: string, _supervisorId: string, reason: string) {
    const rejectionReason = reason.trim()
    if (!rejectionReason) throw new Error('Informe o motivo da rejeição.')
    const [entry] = await this.decide([entryId], 'REJECTED', rejectionReason)
    if (!entry) throw new Error('Apontamento não encontrado.')
    return entry
  }

  rejectMany(entryIds: string[], _supervisorId: string, reason: string) {
    const rejectionReason = reason.trim()
    if (!rejectionReason) return Promise.reject(new Error('Informe o motivo da rejeição.'))
    return this.decide(entryIds, 'REJECTED', rejectionReason)
  }

  async listTimeOffRequests(_supervisorId: string) {
    const requests = await this.timeOff.listVisible({ excludeOwn: true })
    return requests
      .map(toSupervisorTimeOff)
      .sort((left, right) => right.startDate.localeCompare(left.startDate) || left.collaboratorName.localeCompare(right.collaboratorName))
  }

  private async decideTimeOff(requestId: string, decision: 'APPROVED' | 'REJECTED', reason?: string) {
    const decided = await this.timeOff.decide(requestId, decision, reason)
    const names = new Map((await this.listPeople().catch(() => [] as CorporatePerson[])).map((person) => [person.id, person.name]))
    return toSupervisorTimeOff({ ...decided, collaboratorName: names.get(decided.collaboratorId) ?? 'Colaborador' })
  }

  approveTimeOffRequest(requestId: string, _supervisorId: string) {
    return this.decideTimeOff(requestId, 'APPROVED')
  }

  rejectTimeOffRequest(requestId: string, _supervisorId: string, reason: string) {
    const rejectionReason = reason.trim()
    if (!rejectionReason) return Promise.reject(new Error('Informe o motivo da rejeição da folga.'))
    return this.decideTimeOff(requestId, 'REJECTED', rejectionReason)
  }

  async getSummary() {
    const entries = await this.listEntries()
    return entries.reduce<SupervisorDashboardSummary>(
      (summary, entry) => ({
        pending: summary.pending + (entry.status === 'PENDING' ? 1 : 0),
        approved: summary.approved + (entry.status === 'APPROVED' ? 1 : 0),
        rejected: summary.rejected + (entry.status === 'REJECTED' ? 1 : 0),
      }),
      { pending: 0, approved: 0, rejected: 0 },
    )
  }

  async getRequestSummary(supervisorId: string) {
    const requests = await this.listTimeOffRequests(supervisorId)
    return requests.reduce<SupervisorRequestSummary>(
      (summary, request) => ({
        pending: summary.pending + (request.status === 'PENDING' ? 1 : 0),
        approved: summary.approved + (request.status === 'APPROVED' ? 1 : 0),
        rejected: summary.rejected + (request.status === 'REJECTED' ? 1 : 0),
      }),
      { pending: 0, approved: 0, rejected: 0 },
    )
  }
}
