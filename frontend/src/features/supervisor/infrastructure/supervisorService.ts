import type { TimeEntryStatus } from '../../time-entries/types'
import type {
  SupervisorDashboardSummary,
  SupervisorPendingEntry,
} from '../types'
import { demoCollaborator } from '../../../demo/fixtures/demoData'
import { TIME_ENTRY_STORAGE_KEY } from '../../time-entries'
import { normalizeTimeEntry, type TimeEntryStorageV4 } from '../../time-entries'
import { createBrowserStorage, type StorageLike } from '../../../shared/infrastructure/storage/browserStorage'
import { getDaysUntilMonthClosing } from '../../../shared/lib/date'
import { getCorporateDataClient, isCorporateDataActive } from '../../corporate/corporateData'
import { SupabaseSupervisorService } from './supabaseSupervisorService'

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
  getSummary(): Promise<SupervisorDashboardSummary>
}

const TEAM_MEMBERS: readonly TeamMember[] = [
  { id: demoCollaborator.id, name: demoCollaborator.name },
  { id: 'demo-collaborator-002', name: 'Marina Costa' },
  { id: 'demo-collaborator-003', name: 'Rafael Almeida' },
  { id: 'demo-collaborator-004', name: 'Bianca Torres' },
]

const COLLABORATOR_NAME_BY_ID = new Map(TEAM_MEMBERS.map((member) => [member.id, member.name]))

const SUPERVISOR_SESSION_ID = 'demo-supervisor-001'

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

  constructor(
    storage: StorageLike,
    now = () => new Date().toISOString(),
    seedEntries: readonly Omit<SupervisorPendingEntry, 'status'>[] = [],
  ) {
    this.storage = storage
    this.now = now
    this.seedEntries = seedEntries
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

}

export const localSupervisorService = new LocalStorageSupervisorService(createBrowserStorage())

const corporateSupervisorService = new SupabaseSupervisorService({
  getClient: getCorporateDataClient,
})

/** Login Microsoft: aprovações no banco de dados. Demonstração e testes: armazenamento local. */
export class RuntimeSupervisorService implements SupervisorService {
  private readonly local: SupervisorService
  private readonly remote: SupervisorService
  private readonly useRemote: () => boolean

  constructor(local: SupervisorService, remote: SupervisorService, useRemote: () => boolean = isCorporateDataActive) {
    this.local = local
    this.remote = remote
    this.useRemote = useRemote
  }

  private active() { return this.useRemote() ? this.remote : this.local }

  listEntries() { return this.active().listEntries() }
  listEscalatedEntries() { return this.active().listEscalatedEntries() }
  listCollaborators() { return this.active().listCollaborators() }
  approve(entryId: string, supervisorId: string) { return this.active().approve(entryId, supervisorId) }
  approveMany(entryIds: string[], supervisorId: string) { return this.active().approveMany(entryIds, supervisorId) }
  approveEscalated(entryId: string, directorId: string) { return this.active().approveEscalated(entryId, directorId) }
  reject(entryId: string, supervisorId: string, reason: string) { return this.active().reject(entryId, supervisorId, reason) }
  rejectMany(entryIds: string[], supervisorId: string, reason: string) { return this.active().rejectMany(entryIds, supervisorId, reason) }
  getSummary() { return this.active().getSummary() }
}

export const supervisorService: SupervisorService = new RuntimeSupervisorService(localSupervisorService, corporateSupervisorService)
