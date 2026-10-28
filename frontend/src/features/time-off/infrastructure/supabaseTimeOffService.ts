import type { SupabaseClient } from '@supabase/supabase-js'
import { corporateDataError, getCorporateUserId, listCorporatePeople, type CorporatePerson } from '../../corporate/corporateData'
import { resolveCorporateAssignment } from '../../time-entries/infrastructure/supabaseTimeEntryService'
import type { AssignmentSnapshot } from '../../squads/types'
import type { AbsenceType, TimeOffRequest } from '../types'
import { getCorporateToday, isIsoDate } from '../../../shared/lib/date'

export const BANCO1_TIME_OFF_TABLE = 'banco1_time_off_requests'

const ABSENCE_TYPES: readonly AbsenceType[] = ['Folga', 'Férias', 'Atestado Médico', 'Outros']
const STATUSES = new Set<TimeOffRequest['status']>(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'])

export type Banco1TimeOffRow = {
  id: string
  collaborator_id: string
  absence_type: string
  start_date: string
  end_date: string
  reason: string
  status: string
  team_id: string | null
  assignment_snapshot: AssignmentSnapshot | null
  rejection_reason: string | null
  cancellation_reason: string | null
  cancelled_at: string | null
  decided_at: string | null
  decided_by: string | null
  version: number
  created_at: string
  updated_at: string
}

export function timeOffFromRow(row: Banco1TimeOffRow, collaboratorName?: string): TimeOffRequest {
  return {
    id: row.id,
    collaboratorId: row.collaborator_id,
    collaboratorName,
    absenceType: ABSENCE_TYPES.includes(row.absence_type as AbsenceType) ? row.absence_type as AbsenceType : 'Outros',
    startDate: row.start_date,
    endDate: row.end_date,
    date: row.start_date,
    reason: row.reason,
    status: STATUSES.has(row.status as TimeOffRequest['status']) ? row.status as TimeOffRequest['status'] : 'PENDING',
    assignmentSnapshot: row.assignment_snapshot ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    decidedAt: row.decided_at ?? undefined,
    rejectionReason: row.rejection_reason ?? undefined,
    cancellationReason: row.cancellation_reason ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
  }
}

type CreateInput = { absenceType?: AbsenceType; startDate?: string; endDate?: string; date?: string; reason: string; collaboratorName?: string }

type Dependencies = {
  getClient: () => SupabaseClient | null
  resolveAssignment?: (collaboratorId: string) => Promise<AssignmentSnapshot | null>
  today?: () => string
}

/**
 * Ausências do Banco 1 no Supabase (tabela banco1_time_off_requests).
 * O banco garante data futura, dono, equipe e quem pode decidir.
 */
export class SupabaseTimeOffService {
  private readonly getClient: () => SupabaseClient | null
  private readonly resolveAssignment: (collaboratorId: string) => Promise<AssignmentSnapshot | null>
  private readonly today: () => string

  constructor({ getClient, resolveAssignment, today }: Dependencies) {
    this.getClient = getClient
    this.resolveAssignment = resolveAssignment ?? resolveCorporateAssignment
    this.today = today ?? getCorporateToday
  }

  private table() {
    const client = this.getClient()
    if (!client) throw new Error('Sessão corporativa indisponível. Entre novamente.')
    return client.from(BANCO1_TIME_OFF_TABLE)
  }

  async listByRange(collaboratorId: string, startDate: string, endDate: string) {
    const { data, error } = await this.table()
      .select('*')
      .eq('collaborator_id', collaboratorId)
      .lte('start_date', endDate)
      .gte('end_date', startDate)
      .order('start_date', { ascending: true })
    if (error) throw corporateDataError(error, 'Não foi possível carregar as ausências.')
    return ((data ?? []) as Banco1TimeOffRow[]).map((row) => timeOffFromRow(row))
  }

  async listApprovedByRange(collaboratorId: string, startDate: string, endDate: string) {
    return (await this.listByRange(collaboratorId, startDate, endDate)).filter((request) => request.status === 'APPROVED')
  }

  async create(collaboratorId: string, input: CreateInput) {
    const reason = input.reason.trim()
    const absenceType = input.absenceType ?? 'Folga'
    const startDate = input.startDate ?? input.date ?? ''
    const endDate = input.endDate ?? startDate
    if (!ABSENCE_TYPES.includes(absenceType)) throw new Error('Informe o tipo de ausência.')
    if (!isIsoDate(startDate) || startDate <= this.today()) throw new Error('A ausência deve ser solicitada para uma data futura.')
    if (!isIsoDate(endDate) || endDate < startDate) throw new Error('Informe uma data de retorno válida.')
    if (!reason) throw new Error('Informe a justificativa da solicitação de ausência.')
    const assignmentSnapshot = await this.resolveAssignment(collaboratorId)
    const { data, error } = await this.table()
      .insert({ collaborator_id: collaboratorId, absence_type: absenceType, start_date: startDate, end_date: endDate, reason, assignment_snapshot: assignmentSnapshot })
      .select('*')
    if (error) throw corporateDataError(error, 'Não foi possível enviar a solicitação de ausência.')
    const row = (data ?? [])[0] as Banco1TimeOffRow | undefined
    if (!row) throw new Error('O banco de dados não confirmou a solicitação de ausência.')
    return timeOffFromRow(row, input.collaboratorName)
  }

  private async cancel(collaboratorId: string, id: string, expected: TimeOffRequest['status'], cancellationReason: string) {
    const { data: currentRows, error: readError } = await this.table().select('*').eq('id', id).eq('collaborator_id', collaboratorId)
    if (readError) throw corporateDataError(readError, 'Não foi possível carregar a ausência.')
    const current = (currentRows ?? [])[0] as Banco1TimeOffRow | undefined
    if (!current) throw new Error('Solicitação de folga não encontrada.')
    if (current.status !== expected) {
      throw new Error(expected === 'PENDING' ? 'Somente uma solicitação pendente pode ser excluída diretamente.' : 'Somente uma folga aprovada pode ser cancelada por esta ação.')
    }
    if (current.start_date <= this.today()) throw new Error('A data da ausência já ocorreu e não permite cancelamento direto.')
    const { data, error } = await this.table()
      .update({ status: 'CANCELLED', cancellation_reason: cancellationReason })
      .eq('id', id)
      .eq('collaborator_id', collaboratorId)
      .eq('version', current.version)
      .select('*')
    if (error) throw corporateDataError(error, 'Não foi possível cancelar a ausência.')
    const row = (data ?? [])[0] as Banco1TimeOffRow | undefined
    if (!row) throw new Error('A ausência foi alterada por outra pessoa. Recarregue a página.')
    return timeOffFromRow(row)
  }

  removePending(collaboratorId: string, id: string) {
    return this.cancel(collaboratorId, id, 'PENDING', 'Solicitação retirada pelo colaborador')
  }

  cancelApproved(collaboratorId: string, id: string, reason: string) {
    const cancellationReason = reason.trim()
    if (!cancellationReason) return Promise.reject(new Error('Informe o motivo do cancelamento da folga.'))
    return this.cancel(collaboratorId, id, 'APPROVED', cancellationReason)
  }

  /** Supervisão/diretoria: decisão pela função do banco (supervisor só a própria equipe). */
  async decide(id: string, decision: 'APPROVED' | 'REJECTED', reason?: string) {
    const client = this.getClient()
    if (!client) throw new Error('Sessão corporativa indisponível. Entre novamente.')
    const { data, error } = await client.rpc('banco1_decide_time_off', { request_id: id, decision, reason: reason ?? null })
    if (error) throw corporateDataError(error, decision === 'APPROVED' ? 'Não foi possível aprovar a ausência.' : 'Não foi possível rejeitar a ausência.')
    const row = ((data ?? []) as Banco1TimeOffRow[])[0]
    if (!row) throw new Error('Solicitação de ausência não encontrada.')
    return timeOffFromRow(row)
  }

  approve(_supervisorId: string, id: string) {
    return this.decide(id, 'APPROVED')
  }

  reject(_supervisorId: string, id: string, reason: string) {
    const rejectionReason = reason.trim()
    if (!rejectionReason) return Promise.reject(new Error('Informe o motivo da rejeição da folga.'))
    return this.decide(id, 'REJECTED', rejectionReason)
  }

  /** Ausências que o usuário pode ver (equipe para supervisor, todas para diretoria), com nomes. */
  async listVisible(options: { excludeOwn?: boolean } = {}) {
    const [{ data, error }, people] = await Promise.all([
      this.table().select('*').order('start_date', { ascending: false }),
      listCorporatePeople().catch(() => [] as CorporatePerson[]),
    ])
    if (error) throw corporateDataError(error, 'Não foi possível carregar as ausências da equipe.')
    const names = new Map(people.map((person) => [person.id, person.name]))
    const userId = getCorporateUserId()
    return ((data ?? []) as Banco1TimeOffRow[])
      .filter((row) => !options.excludeOwn || row.collaborator_id !== userId)
      .map((row) => timeOffFromRow(row, names.get(row.collaborator_id) ?? 'Colaborador'))
  }
}
