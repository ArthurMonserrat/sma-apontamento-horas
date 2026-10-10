import type { AuditEvent, SupervisorNotification } from '../../audit/types'
import type { AssignmentSnapshot } from '../../squads/types'
import type { WorkloadChangeRequest, WorkloadVersion } from '../types'
import { getWorkloadForDate } from '../domain'
import { demoWorkloadVersions } from '../../../demo/fixtures/demoData'
import { getCorporateToday, isIsoDate } from '../../../shared/lib/date'
import { auditService } from '../../../services/auditService'
import { notificationService } from '../../../services/notificationService'
import { profileService } from '../../profile/infrastructure/profileService'
import { createBrowserStorage, type StorageLike } from '../../../shared/infrastructure/storage/browserStorage'
import { defaultPostCommitErrorHandler, runPostCommitEffect, type PostCommitErrorHandler } from '../../../services/postCommit'

const WORKLOAD_STORAGE_KEY = 'sma:workloads:v1'

type WorkloadStorage = {
  version: 1
  versions: WorkloadVersion[]
  requests: WorkloadChangeRequest[]
}

type WorkloadDependencies = {
  storage: StorageLike
  createId?: () => string
  now?: () => string
  today?: () => string
  resolveAssignment?: (collaboratorId: string) => AssignmentSnapshot | null
  audit?: { record(event: AuditEvent): Promise<void> }
  notifications?: { record(notification: SupervisorNotification): Promise<void> }
  initialVersions?: WorkloadVersion[]
  onPostCommitError?: PostCommitErrorHandler
}

function validMinutes(minutes: number) {
  return Number.isInteger(minutes) && minutes > 0 && minutes <= 24 * 60
}

export class LocalWorkloadService {
  private readonly storage: StorageLike
  private readonly createId: () => string
  private readonly now: () => string
  private readonly today: () => string
  private readonly resolveAssignment: (collaboratorId: string) => AssignmentSnapshot | null
  private readonly audit?: { record(event: AuditEvent): Promise<void> }
  private readonly notifications?: { record(notification: SupervisorNotification): Promise<void> }
  private readonly initialVersions: WorkloadVersion[]
  private readonly onPostCommitError: PostCommitErrorHandler

  constructor({ storage, createId, now, today, resolveAssignment, audit, notifications, initialVersions, onPostCommitError }: WorkloadDependencies) {
    this.storage = storage
    this.createId = createId ?? (() => crypto.randomUUID())
    this.now = now ?? (() => new Date().toISOString())
    this.today = today ?? getCorporateToday
    this.resolveAssignment = resolveAssignment ?? (() => null)
    this.audit = audit
    this.notifications = notifications
    this.initialVersions = initialVersions ?? []
    this.onPostCommitError = onPostCommitError ?? defaultPostCommitErrorHandler
  }

  private read(): WorkloadStorage {
    try {
      const raw = this.storage.getItem(WORKLOAD_STORAGE_KEY)
      if (!raw) return { version: 1, versions: [...this.initialVersions], requests: [] }
      const parsed = JSON.parse(raw) as Partial<WorkloadStorage>
      if (parsed.version !== 1 || !Array.isArray(parsed.versions) || !Array.isArray(parsed.requests)) throw new Error('Estrutura de carga inválida.')
      return { version: 1, versions: parsed.versions, requests: parsed.requests }
    } catch (error) {
      console.error('Não foi possível ler as cargas locais.', error)
      return { version: 1, versions: [...this.initialVersions], requests: [] }
    }
  }

  private write(storage: WorkloadStorage) {
    const serialized = JSON.stringify(storage)
    this.storage.setItem(WORKLOAD_STORAGE_KEY, serialized)
    if (this.storage.getItem(WORKLOAD_STORAGE_KEY) !== serialized) throw new Error('Não foi possível confirmar a gravação da carga.')
  }

  async listVersions(collaboratorId: string) {
    return this.read().versions.filter((version) => version.collaboratorId === collaboratorId).sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom))
  }

  async getCurrent(collaboratorId: string, date: string) {
    return getWorkloadForDate(await this.listVersions(collaboratorId), date) ?? null
  }

  async listRequests(collaboratorId: string) {
    return this.read().requests.filter((request) => request.collaboratorId === collaboratorId).sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }

  async createInitial(collaboratorId: string, dailyMinutes: number, effectiveFrom: string) {
    if (!validMinutes(dailyMinutes)) throw new Error('Informe uma carga diária válida.')
    if (!isIsoDate(effectiveFrom)) throw new Error('Informe uma data de início válida.')
    const storage = this.read()
    if (storage.versions.some((version) => version.collaboratorId === collaboratorId)) throw new Error('O colaborador já possui carga horária cadastrada.')
    const timestamp = this.now()
    const version: WorkloadVersion = {
      id: this.createId(), collaboratorId, dailyMinutes, effectiveFrom, status: 'APPROVED', createdAt: timestamp, approvedAt: timestamp,
    }
    storage.versions.push(version)
    this.write(storage)
    return version
  }

  async requestChange(collaboratorId: string, input: { requestedDailyMinutes: number; requestedEffectiveFrom: string; justification: string }) {
    const justification = input.justification.trim()
    if (!validMinutes(input.requestedDailyMinutes)) throw new Error('Informe uma nova carga válida.')
    if (!isIsoDate(input.requestedEffectiveFrom) || input.requestedEffectiveFrom < this.today()) throw new Error('A data de início não pode estar no passado.')
    if (!justification) throw new Error('Informe a justificativa da alteração de carga.')
    const assignmentSnapshot = this.resolveAssignment(collaboratorId)
    if (!assignmentSnapshot) throw new Error('Não existe squad ativa para encaminhar a solicitação.')
    const storage = this.read()
    if (storage.requests.some((request) => request.collaboratorId === collaboratorId && request.status === 'PENDING')) {
      throw new Error('Já existe uma solicitação de carga pendente.')
    }
    const timestamp = this.now()
    const request: WorkloadChangeRequest = {
      id: this.createId(), collaboratorId, requestedDailyMinutes: input.requestedDailyMinutes,
      requestedEffectiveFrom: input.requestedEffectiveFrom, justification, status: 'PENDING', assignmentSnapshot,
      createdAt: timestamp, updatedAt: timestamp,
    }
    storage.requests.push(request)
    this.write(storage)
    if (this.audit) await runPostCommitEffect('Não foi possível registrar a auditoria da carga confirmada.', () => this.audit!.record({ id: crypto.randomUUID(), type: 'WORKLOAD_CHANGE_REQUESTED', occurredAt: timestamp, actorId: collaboratorId, actorRole: 'COLLABORATOR', entityType: 'WorkloadChangeRequest', entityId: request.id, newValue: request, justification }), this.onPostCommitError)
    if (this.notifications) await runPostCommitEffect('Não foi possível registrar a notificação da carga confirmada.', () => this.notifications!.record({ id: crypto.randomUUID(), supervisorId: assignmentSnapshot.supervisorId, type: 'WORKLOAD_CHANGE_REQUESTED', relatedEntityId: request.id, createdAt: timestamp }), this.onPostCommitError)
    return request
  }

  async applyApprovedRequest(requestId: string, approvedEffectiveFrom: string, supervisorId: string) {
    const storage = this.read()
    const index = storage.requests.findIndex((request) => request.id === requestId)
    if (index < 0) throw new Error('Solicitação de carga não encontrada.')
    const current = storage.requests[index]
    if (current.status !== 'PENDING') throw new Error('A solicitação não está pendente.')
    if (!current.assignmentSnapshot || current.assignmentSnapshot.supervisorId !== supervisorId) throw new Error('Somente o supervisor associado pode aprovar a nova carga.')
    const timestamp = this.now()
    const approved: WorkloadChangeRequest = { ...current, status: 'APPROVED', requestedEffectiveFrom: approvedEffectiveFrom, decidedAt: timestamp, updatedAt: timestamp }
    storage.requests[index] = approved
    storage.versions.push({
      id: this.createId(), collaboratorId: current.collaboratorId, dailyMinutes: current.requestedDailyMinutes,
      effectiveFrom: approvedEffectiveFrom, status: 'APPROVED', createdAt: timestamp, approvedAt: timestamp,
    })
    this.write(storage)
    if (this.audit) await runPostCommitEffect('Não foi possível registrar a auditoria da carga confirmada.', () => this.audit!.record({ id: crypto.randomUUID(), type: 'WORKLOAD_CHANGE_APPROVED', occurredAt: timestamp, actorId: supervisorId, actorRole: 'SUPERVISOR', entityType: 'WorkloadChangeRequest', entityId: current.id, previousValue: current, newValue: approved }), this.onPostCommitError)
    return approved
  }

  async rejectRequest(requestId: string, reason: string, supervisorId: string) {
    const rejectionReason = reason.trim()
    if (!rejectionReason) throw new Error('Informe a justificativa da rejeição.')
    const storage = this.read()
    const index = storage.requests.findIndex((request) => request.id === requestId)
    if (index < 0) throw new Error('Solicitação de carga não encontrada.')
    const current = storage.requests[index]
    if (current.status !== 'PENDING') throw new Error('A solicitação não está pendente.')
    if (!current.assignmentSnapshot || current.assignmentSnapshot.supervisorId !== supervisorId) throw new Error('Somente o supervisor associado pode rejeitar a nova carga.')
    const timestamp = this.now()
    const rejected: WorkloadChangeRequest = { ...current, status: 'REJECTED', rejectionReason, decidedAt: timestamp, updatedAt: timestamp }
    storage.requests[index] = rejected
    this.write(storage)
    if (this.audit) await runPostCommitEffect('Não foi possível registrar a auditoria da carga confirmada.', () => this.audit!.record({
      id: crypto.randomUUID(), type: 'WORKLOAD_CHANGE_REJECTED', occurredAt: timestamp, actorId: supervisorId, actorRole: 'SUPERVISOR',
      entityType: 'WorkloadChangeRequest', entityId: current.id, previousValue: current, newValue: rejected, justification: rejectionReason,
    }), this.onPostCommitError)
    return rejected
  }
}

export const workloadService = new LocalWorkloadService({
  storage: createBrowserStorage(), initialVersions: demoWorkloadVersions,
  resolveAssignment: (collaboratorId) => profileService.resolveAssignment(collaboratorId),
  audit: auditService, notifications: notificationService,
})
