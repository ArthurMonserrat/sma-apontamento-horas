import {
  approveDay as approveDayTransition,
  canMutateDay,
  completeCorrection,
  deriveDayApprovalStatus,
  reopenCompetency as reopenCompetencyTransition,
  reopenDay as reopenDayTransition,
  requestCorrection as requestCorrectionTransition,
} from '../features/approvals/domain'
import type { CompetencyState, DayApproval } from '../features/approvals/types'
import type { AuditEvent } from '../features/audit/types'
import { getCorporateToday, getMonthKey } from '../shared/lib/date'
import { createBrowserStorage, type StorageLike } from '../shared/infrastructure/storage/browserStorage'
import { auditService } from './auditService'
import { defaultPostCommitErrorHandler, runPostCommitEffect, type PostCommitErrorHandler } from './postCommit'

const APPROVAL_STORAGE_KEY = 'sma:day-approvals:v1'
const COMPETENCY_STORAGE_KEY = 'sma:competencies:v1'

export class LocalDayApprovalService {
  private readonly storage: StorageLike
  private readonly today: () => string
  private readonly now: () => string
  private readonly audit?: { record(event: AuditEvent): Promise<void> }
  private readonly onPostCommitError: PostCommitErrorHandler

  constructor(storage: StorageLike, today: () => string = getCorporateToday, audit?: { record(event: AuditEvent): Promise<void> }, now: () => string = () => new Date().toISOString(), onPostCommitError: PostCommitErrorHandler = defaultPostCommitErrorHandler) {
    this.storage = storage
    this.today = today
    this.audit = audit
    this.now = now
    this.onPostCommitError = onPostCommitError
  }

  private readRecord<T>(key: string): Record<string, T> {
    try {
      const raw = this.storage.getItem(key)
      if (!raw) return {}
      const parsed = JSON.parse(raw) as unknown
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, T> : {}
    } catch (error) {
      console.error('Não foi possível ler o estado diário local.', error)
      return {}
    }
  }

  private approvalKey(collaboratorId: string, date: string) {
    return `${collaboratorId}:${date}`
  }

  getCompetency(monthKey: string) {
    const stored = this.readRecord<CompetencyState>(COMPETENCY_STORAGE_KEY)[monthKey]
    if (stored) return stored
    return {
      monthKey,
      status: monthKey === getMonthKey(this.today()) ? 'OPEN' : 'CLOSED',
      reopenedDates: [],
    } satisfies CompetencyState
  }

  async getForDate(
    collaboratorId: string,
    date: string,
    hasEntries: boolean,
    assignmentSnapshot: DayApproval['assignmentSnapshot'] = null,
    isApplicable = true,
  ): Promise<DayApproval | null> {
    if (!isApplicable || date > this.today()) return null
    const stored = this.readRecord<DayApproval>(APPROVAL_STORAGE_KEY)[this.approvalKey(collaboratorId, date)]
    if (stored) return stored
    const competency = this.getCompetency(getMonthKey(date))
    const status = deriveDayApprovalStatus({
      date,
      today: this.today(),
      competencyClosed: competency.status === 'CLOSED',
      hasEntries,
      isApplicable,
    })
    if (!status) return null
    return {
      id: `day:${collaboratorId}:${date}`,
      collaboratorId,
      entryDate: date,
      assignmentSnapshot,
      status,
      version: 1,
      updatedAt: this.now(),
    } satisfies DayApproval
  }

  async canMutate(collaboratorId: string, date: string) {
    const today = this.today()
    if (date > today) return false
    const competency = this.getCompetency(getMonthKey(date))
    const stored = this.readRecord<DayApproval>(APPROVAL_STORAGE_KEY)[this.approvalKey(collaboratorId, date)] ?? null
    return canMutateDay(stored, competency)
  }

  async canMutateRange(collaboratorId: string, dates: string[]) {
    if (dates.length === 0) return false
    const monthKey = getMonthKey(dates[0])
    const competency = this.getCompetency(monthKey)
    const storedApprovals = this.readRecord<DayApproval>(APPROVAL_STORAGE_KEY)
    const competencyOpen = competency.status === 'OPEN' || competency.status === 'REOPENED'
    if (!competencyOpen) return false

    return dates.every((date) => {
      if (getMonthKey(date) !== monthKey) return false
      const stored = storedApprovals[this.approvalKey(collaboratorId, date)] ?? null
      return canMutateDay(stored, competency)
    })
  }

  async save(approval: DayApproval) {
    const current = this.readRecord<DayApproval>(APPROVAL_STORAGE_KEY)
    current[this.approvalKey(approval.collaboratorId, approval.entryDate)] = approval
    this.storage.setItem(APPROVAL_STORAGE_KEY, JSON.stringify(current))
  }

  private getStoredApproval(collaboratorId: string, date: string) {
    const stored = this.readRecord<DayApproval>(APPROVAL_STORAGE_KEY)[this.approvalKey(collaboratorId, date)]
    if (!stored) throw new Error('O conjunto diário não foi encontrado.')
    return stored
  }

  private assertResponsibleSupervisor(approval: DayApproval, supervisorId: string) {
    if (!approval.assignmentSnapshot) {
      throw new Error('O conjunto diário não possui supervisor responsável registrado.')
    }
    if (approval.assignmentSnapshot.supervisorId !== supervisorId) {
      throw new Error('Somente o supervisor associado ao conjunto diário pode executar esta operação.')
    }
  }

  private assertVersion(approval: DayApproval, expectedVersion: number) {
    if (approval.version !== expectedVersion) {
      throw new Error('A versão do conjunto diário foi alterada. Recarregue os dados.')
    }
  }

  private async recordSupervisorAction(type: AuditEvent['type'], supervisorId: string, previous: DayApproval, next: DayApproval, justification?: string) {
    if (!this.audit) return
    await runPostCommitEffect('Não foi possível registrar a auditoria da aprovação confirmada.', () => this.audit!.record({
      id: crypto.randomUUID(), type, occurredAt: next.updatedAt, actorId: supervisorId, actorRole: 'SUPERVISOR',
      entityType: 'DayApproval', entityId: next.id, previousValue: previous, newValue: next, justification,
    }), this.onPostCommitError)
  }

  async approveDay(command: { supervisorId: string; collaboratorId: string; date: string; balanceMinutes: number; justification: string; expectedVersion: number }) {
    const current = this.getStoredApproval(command.collaboratorId, command.date)
    this.assertResponsibleSupervisor(current, command.supervisorId)
    this.assertVersion(current, command.expectedVersion)
    const timestamp = this.now()
    const approved = {
      ...approveDayTransition(current, { today: this.today(), balanceMinutes: command.balanceMinutes, justification: command.justification }),
      approvedAt: timestamp,
      updatedAt: timestamp,
    }
    await this.save(approved)
    await this.recordSupervisorAction(command.balanceMinutes < 0 ? 'DAY_APPROVED_WITH_DEFICIT' : 'DAY_APPROVED', command.supervisorId, current, approved, approved.deficitJustification)
    return approved
  }

  async requestCorrection(supervisorId: string, collaboratorId: string, date: string, reason: string, expectedVersion: number) {
    const current = this.getStoredApproval(collaboratorId, date)
    this.assertResponsibleSupervisor(current, supervisorId)
    this.assertVersion(current, expectedVersion)
    const requested = { ...requestCorrectionTransition(current, reason), updatedAt: this.now() }
    await this.save(requested)
    await this.recordSupervisorAction('CORRECTION_REQUESTED', supervisorId, current, requested, requested.correctionReason)
    return requested
  }

  async closeCompetency(monthKey: string) {
    if (!/^\d{4}-\d{2}$/.test(monthKey)) throw new Error('Competência inválida.')
    const competencies = this.readRecord<CompetencyState>(COMPETENCY_STORAGE_KEY)
    competencies[monthKey] = { ...this.getCompetency(monthKey), status: 'CLOSED' }
    this.storage.setItem(COMPETENCY_STORAGE_KEY, JSON.stringify(competencies))
    return competencies[monthKey]
  }

  async reopenDay(supervisorId: string, collaboratorId: string, date: string, justification: string, expectedVersion: number) {
    const current = this.getStoredApproval(collaboratorId, date)
    this.assertResponsibleSupervisor(current, supervisorId)
    this.assertVersion(current, expectedVersion)
    const reopened = { ...reopenDayTransition(current, justification), updatedAt: this.now() }
    await this.save(reopened)
    await this.recordSupervisorAction('DAY_REOPENED', supervisorId, current, reopened, reopened.reopenJustification)
    return reopened
  }

  async reopenCompetency(supervisorId: string, monthKey: string, justification: string) {
    const current = this.getCompetency(monthKey)
    const reopened = {
      ...reopenCompetencyTransition(current, justification),
      reopenedBy: supervisorId,
      reopenedAt: this.now(),
    }
    const competencies = this.readRecord<CompetencyState>(COMPETENCY_STORAGE_KEY)
    competencies[monthKey] = reopened
    this.storage.setItem(COMPETENCY_STORAGE_KEY, JSON.stringify(competencies))
    if (this.audit) await runPostCommitEffect('Não foi possível registrar a auditoria da competência confirmada.', () => this.audit!.record({
      id: crypto.randomUUID(), type: 'COMPETENCY_REOPENED', occurredAt: reopened.reopenedAt,
      actorId: supervisorId, actorRole: 'SUPERVISOR', entityType: 'CompetencyState', entityId: monthKey,
      previousValue: current, newValue: reopened, justification: reopened.reopenJustification,
    }), this.onPostCommitError)
    return reopened
  }

  async completeCorrection(collaboratorId: string, date: string, expectedVersion: number) {
    const stored = this.readRecord<DayApproval>(APPROVAL_STORAGE_KEY)[this.approvalKey(collaboratorId, date)]
    if (!stored) throw new Error('Não existe solicitação de correção para esta data.')
    this.assertVersion(stored, expectedVersion)
    const timestamp = this.now()
    const completed = { ...completeCorrection(stored), correctionCompletedAt: timestamp, updatedAt: timestamp }
    await this.save(completed)
    if (this.audit) await runPostCommitEffect('Não foi possível registrar a auditoria da correção confirmada.', () => this.audit!.record({
      id: crypto.randomUUID(),
      type: 'CORRECTION_COMPLETED',
      occurredAt: completed.updatedAt,
      actorId: collaboratorId,
      actorRole: 'COLLABORATOR',
      entityType: 'DayApproval',
      entityId: completed.id,
      previousValue: stored,
      newValue: completed,
    }), this.onPostCommitError)
    return completed
  }

  async listByRange(collaboratorId: string, startDate: string, endDate: string) {
    return Object.values(this.readRecord<DayApproval>(APPROVAL_STORAGE_KEY))
      .filter((approval) => approval.collaboratorId === collaboratorId && approval.entryDate >= startDate && approval.entryDate <= endDate)
  }
}

export const dayApprovalService = new LocalDayApprovalService(createBrowserStorage(), getCorporateToday, auditService)
