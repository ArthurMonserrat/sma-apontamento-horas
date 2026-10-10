import type { TimeOffRequest } from '../../time-off/types'
import type { TimeEntryStatus } from '../../time-entries/types'
import type {
  SupervisorDashboardSummary,
  SupervisorPendingEntry,
  SupervisorRequestSummary,
  SupervisorTimeOffRequest,
} from '../types'
import { demoAssignmentSnapshot, demoCollaborator } from '../../../demo/fixtures/demoData'
import { TIME_ENTRY_STORAGE_KEY } from '../../time-entries'
import { normalizeTimeEntry, type TimeEntryStorageV4 } from '../../time-entries'
import { TIME_OFF_STORAGE_KEY, timeOffService, type TimeOffStorage } from '../../time-off/infrastructure/timeOffService'
import { createBrowserStorage, type StorageLike } from '../../../shared/infrastructure/storage/browserStorage'
import { getDaysUntilMonthClosing } from '../../../shared/lib/date'

export const SUPERVISOR_APPROVAL_STORAGE_KEY = 'sma:supervisor-approvals:v1'

type StoredApproval = {
  status: SupervisorPendingEntry['status']
  rejectionReason?: string
  decidedAt?: string
  decidedBy?: string
}

type SupervisorApprovalStorage = {
  version: 1
  approvalsByEntryId: Record<string, StoredApproval>
}

type TeamMember = {
  id: string
  name: string
}

type SupervisorEntrySource = Omit<SupervisorPendingEntry, 'status'> & {
  sourceStatus?: TimeEntryStatus
}

export interface SupervisorService {
  listEntries(): Promise<SupervisorPendingEntry[]>
  listEscalatedEntries(): Promise<SupervisorPendingEntry[]>
  listCollaborators(): Promise<TeamMember[]>
  approve(entryId: string, supervisorId: string): Promise<SupervisorPendingEntry>
  approveMany(entryIds: string[], supervisorId: string): Promise<SupervisorPendingEntry[]>
  approveEscalated(entryId: string, directorId: string): Promise<SupervisorPendingEntry>
  reject(entryId: string, supervisorId: string, reason: string): Promise<SupervisorPendingEntry>
  rejectMany(entryIds: string[], supervisorId: string, reason: string): Promise<SupervisorPendingEntry[]>
  listTimeOffRequests(supervisorId: string): Promise<SupervisorTimeOffRequest[]>
  approveTimeOffRequest(requestId: string, supervisorId: string): Promise<SupervisorTimeOffRequest>
  rejectTimeOffRequest(requestId: string, supervisorId: string, reason: string): Promise<SupervisorTimeOffRequest>
  getSummary(): Promise<SupervisorDashboardSummary>
  getRequestSummary(supervisorId: string): Promise<SupervisorRequestSummary>
}

const TEAM_MEMBERS: readonly TeamMember[] = [
  { id: demoCollaborator.id, name: demoCollaborator.name },
  { id: 'demo-collaborator-002', name: 'Marina Costa' },
  { id: 'demo-collaborator-003', name: 'Rafael Almeida' },
  { id: 'demo-collaborator-004', name: 'Bianca Torres' },
]

const COLLABORATOR_NAME_BY_ID = new Map(TEAM_MEMBERS.map((member) => [member.id, member.name]))

const SUPERVISOR_SESSION_ID = 'demo-supervisor-001'
const COMPATIBLE_SUPERVISOR_IDS = new Set([SUPERVISOR_SESSION_ID, demoAssignmentSnapshot.supervisorId])
const timeOffStatusFromStored = {
  Pendente: 'PENDING',
  Aprovado: 'APPROVED',
  Rejeitado: 'REJECTED',
  Cancelado: 'CANCELLED',
} as const
const timeOffStatusToStored = {
  PENDING: 'Pendente',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
  CANCELLED: 'Cancelado',
} as const

export const MOCK_TEAM_ENTRIES: readonly Omit<SupervisorPendingEntry, 'status'>[] = [
  { id: 'supervisor-demo-entry-001', collaboratorId: demoCollaborator.id, collaboratorName: demoCollaborator.name, entryDate: '2026-07-21', projectCode: 'SM&A-ENG-142', durationMinutes: 480, activityName: 'Elaboração de projeto' },
  { id: 'supervisor-demo-entry-002', collaboratorId: 'demo-collaborator-002', collaboratorName: 'Marina Costa', entryDate: '2026-07-21', projectCode: 'SM&A-AUT-087', durationMinutes: 360, activityName: 'Modelo 3D' },
  { id: 'supervisor-demo-entry-003', collaboratorId: 'demo-collaborator-003', collaboratorName: 'Rafael Almeida', entryDate: '2026-07-22', projectCode: 'SM&A-ELE-211', durationMinutes: 420, activityName: 'Verificação de documento' },
  { id: 'supervisor-demo-entry-004', collaboratorId: 'demo-collaborator-004', collaboratorName: 'Bianca Torres', entryDate: '2026-07-23', projectCode: 'SM&A-ENG-155', durationMinutes: 300, activityName: 'Reunião com cliente' },
  { id: 'supervisor-demo-entry-005', collaboratorId: demoCollaborator.id, collaboratorName: demoCollaborator.name, entryDate: '2026-07-24', projectCode: 'SM&A-ENG-142', durationMinutes: 390, activityName: 'Atendimento de comentários internos' },
  { id: 'supervisor-demo-entry-006', collaboratorId: 'demo-collaborator-002', collaboratorName: 'Marina Costa', entryDate: '2026-07-24', projectCode: 'SM&A-AUT-087', durationMinutes: 480, activityName: 'Emissão de documento' },
  { id: 'supervisor-demo-entry-007', collaboratorId: 'demo-collaborator-003', collaboratorName: 'Rafael Almeida', entryDate: '2026-07-27', projectCode: 'SM&A-ELE-211', durationMinutes: 450, activityName: 'Levantamento de campo' },
  { id: 'supervisor-demo-entry-008', collaboratorId: 'demo-collaborator-004', collaboratorName: 'Bianca Torres', entryDate: '2026-07-28', projectCode: 'SM&A-ADM-044', durationMinutes: 240, activityName: 'Apoio propostas' },
  { id: 'supervisor-demo-entry-009', collaboratorId: demoCollaborator.id, collaboratorName: demoCollaborator.name, entryDate: '2026-07-29', projectCode: 'SM&A-ENG-161', durationMinutes: 480, activityName: 'Análise de documento' },
  { id: 'supervisor-demo-entry-010', collaboratorId: 'demo-collaborator-002', collaboratorName: 'Marina Costa', entryDate: '2026-07-30', projectCode: 'SM&A-AUT-090', durationMinutes: 420, activityName: 'Gerenciamento e cronograma' },
]

const DEFAULT_APPROVALS: Record<string, StoredApproval> = {
  'supervisor-demo-entry-001': { status: 'APPROVED', decidedAt: '2026-07-22T12:00:00.000Z', decidedBy: 'demo-supervisor-001' },
  'supervisor-demo-entry-003': { status: 'REJECTED', rejectionReason: 'Detalhar melhor a verificação realizada.', decidedAt: '2026-07-23T12:00:00.000Z', decidedBy: 'demo-supervisor-001' },
  'supervisor-demo-entry-006': { status: 'APPROVED', decidedAt: '2026-07-25T12:00:00.000Z', decidedBy: 'demo-supervisor-001' },
}

export const SEED_TIME_OFF_REQUESTS: readonly TimeOffRequest[] = [
  { id: 'supervisor-demo-time-off-001', collaboratorId: demoCollaborator.id, date: '2026-08-05', reason: 'Compromisso familiar previamente agendado.', status: 'PENDING', assignmentSnapshot: demoAssignmentSnapshot, createdAt: '2026-07-29T12:00:00.000Z', updatedAt: '2026-07-29T12:00:00.000Z' },
  { id: 'supervisor-demo-time-off-002', collaboratorId: 'demo-collaborator-002', date: '2026-08-07', reason: 'Banco de horas para resolver documentação pessoal.', status: 'PENDING', assignmentSnapshot: demoAssignmentSnapshot, createdAt: '2026-07-30T12:00:00.000Z', updatedAt: '2026-07-30T12:00:00.000Z' },
  { id: 'supervisor-demo-time-off-003', collaboratorId: 'demo-collaborator-003', date: '2026-08-10', reason: 'Consulta médica.', status: 'APPROVED', assignmentSnapshot: demoAssignmentSnapshot, createdAt: '2026-07-26T12:00:00.000Z', updatedAt: '2026-07-27T12:00:00.000Z', decidedAt: '2026-07-27T12:00:00.000Z' },
  { id: 'supervisor-demo-time-off-004', collaboratorId: 'demo-collaborator-004', date: '2026-08-12', reason: 'Viagem curta.', status: 'REJECTED', assignmentSnapshot: demoAssignmentSnapshot, createdAt: '2026-07-25T12:00:00.000Z', updatedAt: '2026-07-26T12:00:00.000Z', decidedAt: '2026-07-26T12:00:00.000Z', rejectionReason: 'Conflito com entrega crítica da equipe.' },
]

function emptyStorage(): SupervisorApprovalStorage {
  return { version: 1, approvalsByEntryId: {} }
}

function normalizeStorage(value: unknown): SupervisorApprovalStorage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyStorage()
  const candidate = value as Partial<SupervisorApprovalStorage>
  if (candidate.version !== 1 || !candidate.approvalsByEntryId || typeof candidate.approvalsByEntryId !== 'object') return emptyStorage()
  return {
    version: 1,
    approvalsByEntryId: Object.fromEntries(
      Object.entries(candidate.approvalsByEntryId).flatMap(([entryId, approval]) => {
        if (!approval || typeof approval !== 'object' || Array.isArray(approval)) return []
        const normalized = approval as Partial<StoredApproval>
        if (!normalized.status || !['PENDING', 'APPROVED', 'REJECTED'].includes(normalized.status)) return []
        return [[entryId, normalized as StoredApproval]]
      }),
    ),
  }
}

export class LocalStorageSupervisorService implements SupervisorService {
  private readonly storage: StorageLike
  private readonly now: () => string
  private readonly seedEntries: readonly Omit<SupervisorPendingEntry, 'status'>[]
  private readonly seedTimeOffRequests: readonly TimeOffRequest[]

  constructor(
    storage: StorageLike,
    now = () => new Date().toISOString(),
    seedEntries: readonly Omit<SupervisorPendingEntry, 'status'>[] = [],
    seedTimeOffRequests: readonly TimeOffRequest[] = [],
  ) {
    this.storage = storage
    this.now = now
    this.seedEntries = seedEntries
    this.seedTimeOffRequests = seedTimeOffRequests
  }

  private read(): SupervisorApprovalStorage {
    try {
      const raw = this.storage.getItem(SUPERVISOR_APPROVAL_STORAGE_KEY)
      if (!raw) return { version: 1, approvalsByEntryId: { ...DEFAULT_APPROVALS } }
      return normalizeStorage(JSON.parse(raw))
    } catch {
      return { version: 1, approvalsByEntryId: { ...DEFAULT_APPROVALS } }
    }
  }

  private write(data: SupervisorApprovalStorage) {
    this.storage.setItem(SUPERVISOR_APPROVAL_STORAGE_KEY, JSON.stringify(data))
  }

  private writeTimeEntryStorage(data: TimeEntryStorageV4) {
    this.storage.setItem(TIME_ENTRY_STORAGE_KEY, JSON.stringify(data))
  }

  private readTimeEntryStorage(): TimeEntryStorageV4 {
    try {
      const raw = this.storage.getItem(TIME_ENTRY_STORAGE_KEY)
      if (!raw) return { version: 4, entriesByCollaborator: {} }
      const parsed = JSON.parse(raw) as Partial<TimeEntryStorageV4> | Array<Record<string, unknown>>
      if (Array.isArray(parsed)) {
        const entriesByCollaborator = parsed.reduce<Record<string, unknown[]>>((grouped, entry) => {
          const collaboratorId = entry.collaboratorId
          if (typeof collaboratorId !== 'string') return grouped
          grouped[collaboratorId] = [...(grouped[collaboratorId] ?? []), entry]
          return grouped
        }, {})
        return {
          version: 4,
          entriesByCollaborator: Object.fromEntries(
            Object.entries(entriesByCollaborator).map(([collaboratorId, entries]) => [
              collaboratorId,
              entries.flatMap((entry) => {
                const normalized = normalizeTimeEntry(entry, collaboratorId)
                return normalized ? [normalized] : []
              }),
            ]),
          ),
        }
      }
      if (parsed.version !== 4 || !parsed.entriesByCollaborator || typeof parsed.entriesByCollaborator !== 'object') {
        return { version: 4, entriesByCollaborator: {} }
      }
      const entriesByCollaborator = Object.fromEntries(
        Object.entries(parsed.entriesByCollaborator).map(([collaboratorId, entries]) => [
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
    } catch {
      return { version: 4, entriesByCollaborator: {} }
    }
  }

  private readTimeOffStorage(): TimeOffStorage {
    try {
      const raw = this.storage.getItem(TIME_OFF_STORAGE_KEY)
      if (!raw) return { version: 1, requests: [] }
      const parsed = JSON.parse(raw) as Partial<TimeOffStorage> | Array<Record<string, unknown>>
      if (Array.isArray(parsed)) {
        return {
          version: 1,
          requests: parsed.flatMap((item): TimeOffRequest[] => {
            const status = timeOffStatusFromStored[item.status as keyof typeof timeOffStatusFromStored]
            if (typeof item.id !== 'string'
              || typeof item.colaborador !== 'string'
              || typeof item.tipo !== 'string'
              || typeof item.dataInicio !== 'string'
              || typeof item.dataRetorno !== 'string'
              || typeof item.justificativa !== 'string'
              || !status) return []
            return [{
              id: item.id,
              collaboratorId: typeof item.colaboradorId === 'string' ? item.colaboradorId : item.colaborador,
              collaboratorName: item.colaborador,
              absenceType: item.tipo as TimeOffRequest['absenceType'],
              startDate: item.dataInicio,
              endDate: item.dataRetorno,
              date: item.dataInicio,
              reason: item.justificativa,
              status,
              assignmentSnapshot: item.assignmentSnapshot as TimeOffRequest['assignmentSnapshot'],
              createdAt: typeof item.createdAt === 'string' ? item.createdAt : this.now(),
              updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : this.now(),
              decidedAt: typeof item.decidedAt === 'string' ? item.decidedAt : undefined,
              rejectionReason: typeof item.rejectionReason === 'string' ? item.rejectionReason : undefined,
              cancellationReason: typeof item.cancellationReason === 'string' ? item.cancellationReason : undefined,
              cancelledAt: typeof item.cancelledAt === 'string' ? item.cancelledAt : undefined,
            }]
          }),
        }
      }
      if (parsed.version !== 1 || !Array.isArray(parsed.requests)) return { version: 1, requests: [] }
      return { version: 1, requests: parsed.requests as TimeOffRequest[] }
    } catch {
      return { version: 1, requests: [] }
    }
  }

  private writeTimeOffStorage(data: TimeOffStorage) {
    this.storage.setItem(TIME_OFF_STORAGE_KEY, JSON.stringify(data.requests.map((request) => ({
      id: request.id,
      colaborador: request.collaboratorName ?? COLLABORATOR_NAME_BY_ID.get(request.collaboratorId) ?? request.collaboratorId,
      colaboradorId: request.collaboratorId,
      tipo: request.absenceType ?? 'Folga',
      dataInicio: request.startDate ?? request.date,
      dataRetorno: request.endDate ?? request.date,
      justificativa: request.reason,
      status: timeOffStatusToStored[request.status],
      assignmentSnapshot: request.assignmentSnapshot,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      decidedAt: request.decidedAt,
      rejectionReason: request.rejectionReason,
      cancellationReason: request.cancellationReason,
      cancelledAt: request.cancelledAt,
    }))))
  }

  private ensureSeedTimeOffRequests() {
    const storage = this.readTimeOffStorage()
    const existingIds = new Set(storage.requests.map((request) => request.id))
    const missing = this.seedTimeOffRequests.filter((request) => !existingIds.has(request.id))
    if (missing.length === 0) return storage
    const nextStorage = { ...storage, requests: [...storage.requests, ...missing] }
    this.writeTimeOffStorage(nextStorage)
    return nextStorage
  }

  private async update(entryId: string, approval: StoredApproval) {
    const entries = await this.listEntries()
    const current = entries.find((entry) => entry.id === entryId)
    if (!current) throw new Error('Apontamento não encontrado.')
    const data = this.read()
    data.approvalsByEntryId[entryId] = approval
    this.write(data)

    const timeEntryStorage = this.readTimeEntryStorage()
    const nextStatus = approval.status === 'APPROVED'
      ? 'APPROVED'
      : approval.status === 'REJECTED'
        ? 'REJECTED'
        : 'PENDING'
    let changed = false
    timeEntryStorage.entriesByCollaborator = Object.fromEntries(
      Object.entries(timeEntryStorage.entriesByCollaborator).map(([collaboratorId, collaboratorEntries]) => [
        collaboratorId,
        collaboratorEntries.map((entry) => {
          if (entry.id !== entryId) return entry
          changed = true
          return { ...entry, status: nextStatus, updatedAt: this.now() }
        }),
      ]),
    )
    if (changed) this.writeTimeEntryStorage(timeEntryStorage)

    return { ...current, ...approval }
  }

  async listEntries() {
    const daysUntilClosing = getDaysUntilMonthClosing()
    const stored = this.read().approvalsByEntryId
    const realEntries = Object.values(this.readTimeEntryStorage().entriesByCollaborator).flat().map<SupervisorEntrySource>((entry) => ({
      id: entry.id,
      collaboratorId: entry.collaboratorId,
      collaboratorName: COLLABORATOR_NAME_BY_ID.get(entry.collaboratorId) ?? entry.collaboratorId,
      entryDate: entry.entryDate,
      projectCode: entry.projectCode,
      durationMinutes: entry.durationMinutes,
      details: entry.details,
      assignmentSnapshot: entry.assignmentSnapshot,
      activityName: entry.activityId,
      sourceStatus: entry.status,
      rejectionReason: entry.status === 'CANCELLED' ? entry.cancelReason ?? 'Apontamento cancelado pelo colaborador.' : undefined,
    }))
    const entriesById = new Map<string, SupervisorEntrySource>([...this.seedEntries, ...realEntries].map((entry) => [entry.id, entry]))
    return Array.from(entriesById.values())
      .map((entry) => {
        const status = stored[entry.id]?.status
          ?? (entry.rejectionReason
            ? 'REJECTED'
            : entry.sourceStatus === 'APPROVED' || entry.sourceStatus === 'REJECTED' || entry.sourceStatus === 'PENDING'
              ? entry.sourceStatus
              : 'PENDING')
        return {
          ...entry,
          status,
          rejectionReason: stored[entry.id]?.rejectionReason ?? entry.rejectionReason,
          decidedAt: stored[entry.id]?.decidedAt,
          decidedBy: stored[entry.id]?.decidedBy,
          escalated: daysUntilClosing <= 1 && status === 'PENDING',
        }
      })
      .sort((left, right) => right.entryDate.localeCompare(left.entryDate) || left.collaboratorName.localeCompare(right.collaboratorName))
  }

  async listEscalatedEntries() {
    return (await this.listEntries()).filter((entry) => entry.status === 'PENDING' && entry.escalated)
  }

  async listCollaborators() {
    const dynamicCollaborators = Object.keys(this.readTimeEntryStorage().entriesByCollaborator)
      .filter((collaboratorId) => !COLLABORATOR_NAME_BY_ID.has(collaboratorId))
      .map((collaboratorId) => ({ id: collaboratorId, name: collaboratorId }))
    return [...TEAM_MEMBERS.map((member) => ({ ...member })), ...dynamicCollaborators]
  }

  approve(entryId: string, supervisorId: string) {
    return this.update(entryId, { status: 'APPROVED', decidedAt: this.now(), decidedBy: supervisorId })
  }

  approveMany(entryIds: string[], supervisorId: string) {
    return Promise.all(entryIds.map((entryId) => this.approve(entryId, supervisorId)))
  }

  async approveEscalated(entryId: string, directorId: string) {
    const escalated = await this.listEscalatedEntries()
    if (!escalated.some((entry) => entry.id === entryId)) throw new Error('Apontamento não está na fila escalada.')
    return this.update(entryId, { status: 'APPROVED', decidedAt: this.now(), decidedBy: directorId })
  }

  reject(entryId: string, supervisorId: string, reason: string) {
    const rejectionReason = reason.trim()
    if (!rejectionReason) throw new Error('Informe o motivo da rejeição.')
    return this.update(entryId, { status: 'REJECTED', rejectionReason, decidedAt: this.now(), decidedBy: supervisorId })
  }

  rejectMany(entryIds: string[], supervisorId: string, reason: string) {
    return Promise.all(entryIds.map((entryId) => this.reject(entryId, supervisorId, reason)))
  }

  async listTimeOffRequests(supervisorId: string) {
    const storage = this.ensureSeedTimeOffRequests()
    const collaborators = new Map(TEAM_MEMBERS.map((member) => [member.id, member.name]))
    return storage.requests
      .filter((request) => !request.assignmentSnapshot || request.assignmentSnapshot.supervisorId === supervisorId || (supervisorId === SUPERVISOR_SESSION_ID && COMPATIBLE_SUPERVISOR_IDS.has(request.assignmentSnapshot.supervisorId)))
      .map<SupervisorTimeOffRequest>((request) => ({
        id: request.id,
        collaboratorId: request.collaboratorId,
        collaboratorName: request.collaboratorName ?? collaborators.get(request.collaboratorId) ?? request.collaboratorId,
        absenceType: request.absenceType ?? 'Folga',
        startDate: request.startDate ?? request.date,
        endDate: request.endDate ?? request.date,
        date: request.date,
        reason: request.reason,
        status: request.status,
        rejectionReason: request.rejectionReason,
        decidedAt: request.decidedAt,
      }))
      .sort((left, right) => right.startDate.localeCompare(left.startDate) || left.collaboratorName.localeCompare(right.collaboratorName))
  }

  async approveTimeOffRequest(requestId: string, supervisorId: string) {
    const effectiveSupervisorId = this.readTimeOffStorage().requests.find((request) => request.id === requestId)?.assignmentSnapshot?.supervisorId ?? supervisorId
    await timeOffService.approve(effectiveSupervisorId, requestId)
    const updated = (await this.listTimeOffRequests(supervisorId)).find((request) => request.id === requestId)
    if (!updated) throw new Error('Solicitação de folga não encontrada.')
    return updated
  }

  async rejectTimeOffRequest(requestId: string, supervisorId: string, reason: string) {
    const effectiveSupervisorId = this.readTimeOffStorage().requests.find((request) => request.id === requestId)?.assignmentSnapshot?.supervisorId ?? supervisorId
    await timeOffService.reject(effectiveSupervisorId, requestId, reason)
    const updated = (await this.listTimeOffRequests(supervisorId)).find((request) => request.id === requestId)
    if (!updated) throw new Error('Solicitação de folga não encontrada.')
    return updated
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

export const supervisorService = new LocalStorageSupervisorService(createBrowserStorage())
