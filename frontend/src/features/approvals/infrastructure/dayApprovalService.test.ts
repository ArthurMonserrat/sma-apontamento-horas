import { describe, expect, it, vi } from 'vitest'
import type { DayApproval } from '../types'
import type { AuditEvent } from '../../audit/types'
import { LocalDayApprovalService } from './dayApprovalService'
import type { StorageLike } from '../../../shared/infrastructure/storage/browserStorage'

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

const correction: DayApproval = {
  id: 'day-1', collaboratorId: 'collaborator-1', entryDate: '2026-07-17', assignmentSnapshot: {
    squadId: 'squad-1', squadName: 'Squad 1', supervisorId: 'supervisor-1', supervisorName: 'Supervisora 1',
  },
  status: 'CORRECTION_REQUESTED', correctionReason: 'Detalhar a entrega', version: 2, updatedAt: '2026-07-18T12:00:00.000Z',
}

describe('LocalDayApprovalService', () => {
  it('bloqueia datas futuras e competências anteriores fechadas', async () => {
    const service = new LocalDayApprovalService(new MemoryStorage(), () => '2026-07-20')
    await expect(service.canMutate('collaborator-1', '2026-07-21')).resolves.toBe(false)
    await expect(service.canMutate('collaborator-1', '2026-06-30')).resolves.toBe(false)
  })

  it('permite dia atual e anterior da competência aberta', async () => {
    const service = new LocalDayApprovalService(new MemoryStorage(), () => '2026-07-20')
    await expect(service.canMutate('collaborator-1', '2026-07-20')).resolves.toBe(true)
    await expect(service.canMutate('collaborator-1', '2026-07-01')).resolves.toBe(true)
  })

  it('permite lote futuro dentro da competência aberta e rejeita mudança de competência', async () => {
    const service = new LocalDayApprovalService(new MemoryStorage(), () => '2026-07-20')
    await expect(service.canMutateRange('collaborator-1', ['2026-07-20', '2026-07-21', '2026-07-22'])).resolves.toBe(true)
    await expect(service.canMutateRange('collaborator-1', ['2026-07-31', '2026-08-01'])).resolves.toBe(false)
  })

  it('não cria estado de aprovação para dia não aplicável', async () => {
    const service = new LocalDayApprovalService(new MemoryStorage(), () => '2026-07-20')
    await expect(service.getForDate('collaborator-1', '2026-07-19', false, correction.assignmentSnapshot, false)).resolves.toBeNull()
  })

  it('não cria estado futuro mesmo quando o chamador omite a aplicabilidade', async () => {
    const service = new LocalDayApprovalService(new MemoryStorage(), () => '2026-07-20')

    await expect(service.getForDate('collaborator-1', '2026-07-21', true, correction.assignmentSnapshot)).resolves.toBeNull()
  })

  it('conclui correção explicitamente e registra auditoria', async () => {
    const events: AuditEvent[] = []
    const service = new LocalDayApprovalService(new MemoryStorage(), () => '2026-07-20', {
      record: async (event) => { events.push(event) },
    })
    await service.save(correction)

    const completed = await service.completeCorrection('collaborator-1', '2026-07-17', correction.version)

    expect(completed.status).toBe('AVAILABLE_FOR_APPROVAL')
    expect(events.map((event) => event.type)).toEqual(['CORRECTION_COMPLETED'])
    expect(events[0].entityId).toBe(correction.id)
  })

  it('aprova o conjunto diário com déficit e registra a justificativa', async () => {
    const events: AuditEvent[] = []
    const service = new LocalDayApprovalService(new MemoryStorage(), () => '2026-07-20', {
      record: async (event) => { events.push(event) },
    }, () => '2026-07-20T15:00:00.000Z')
    await service.save({ ...correction, status: 'AVAILABLE_FOR_APPROVAL', correctionReason: undefined })

    const approved = await service.approveDay({ supervisorId: 'supervisor-1', collaboratorId: 'collaborator-1', date: '2026-07-17', balanceMinutes: -60, justification: 'Saída autorizada', expectedVersion: correction.version })

    expect(approved).toMatchObject({ status: 'APPROVED', deficitJustification: 'Saída autorizada', approvedAt: '2026-07-20T15:00:00.000Z' })
    expect(events.map((event) => event.type)).toEqual(['DAY_APPROVED_WITH_DEFICIT'])
  })

  it('registra solicitação de correção e mantém o dia mutável', async () => {
    const events: AuditEvent[] = []
    const service = new LocalDayApprovalService(new MemoryStorage(), () => '2026-07-20', {
      record: async (event) => { events.push(event) },
    })
    await service.save({ ...correction, status: 'AVAILABLE_FOR_APPROVAL', correctionReason: undefined })

    const requested = await service.requestCorrection('supervisor-1', 'collaborator-1', '2026-07-17', 'Detalhar documento', correction.version)

    expect(requested).toMatchObject({ status: 'CORRECTION_REQUESTED', correctionReason: 'Detalhar documento' })
    await expect(service.canMutate('collaborator-1', '2026-07-17')).resolves.toBe(true)
    expect(events.map((event) => event.type)).toEqual(['CORRECTION_REQUESTED'])
  })

  it('fecha a competência, deriva ausência de envio e audita reaberturas', async () => {
    const events: AuditEvent[] = []
    const service = new LocalDayApprovalService(new MemoryStorage(), () => '2026-07-20', {
      record: async (event) => { events.push(event) },
    }, () => '2026-07-20T15:00:00.000Z')

    await service.closeCompetency('2026-07')
    const noSubmission = await service.getForDate('collaborator-1', '2026-07-15', false, correction.assignmentSnapshot, true)
    expect(noSubmission?.status).toBe('NO_SUBMISSION')
    if (!noSubmission) throw new Error('Conjunto esperado')
    await service.save(noSubmission)
    await service.reopenDay('supervisor-1', 'collaborator-1', '2026-07-15', 'Documento localizado', noSubmission.version)
    await service.reopenCompetency('supervisor-1', '2026-07', 'Ajuste mensal autorizado')

    await expect(service.canMutate('collaborator-1', '2026-07-15')).resolves.toBe(true)
    expect(events.map((event) => event.type)).toEqual(['DAY_REOPENED', 'COMPETENCY_REOPENED'])
  })

  it('rejeita supervisor ausente, responsável diferente e versão desatualizada', async () => {
    const service = new LocalDayApprovalService(new MemoryStorage(), () => '2026-07-20')
    await service.save({ ...correction, status: 'AVAILABLE_FOR_APPROVAL' })

    await expect(service.approveDay({ supervisorId: 'outro', collaboratorId: 'collaborator-1', date: '2026-07-17', balanceMinutes: 0, justification: '', expectedVersion: 2 })).rejects.toThrow('supervisor associado')
    await expect(service.approveDay({ supervisorId: 'supervisor-1', collaboratorId: 'collaborator-1', date: '2026-07-17', balanceMinutes: 0, justification: '', expectedVersion: 99 })).rejects.toThrow('versão')

    await service.save({ ...correction, status: 'AVAILABLE_FOR_APPROVAL', assignmentSnapshot: null })
    await expect(service.approveDay({ supervisorId: 'supervisor-1', collaboratorId: 'collaborator-1', date: '2026-07-17', balanceMinutes: 0, justification: '', expectedVersion: 2 })).rejects.toThrow('responsável')
  })

  it('preserva aprovação confirmada quando a auditoria falha', async () => {
    const storage = new MemoryStorage()
    const onPostCommitError = vi.fn()
    const service = new LocalDayApprovalService(
      storage,
      () => '2026-07-20',
      { record: async () => { throw new Error('audit failure') } },
      () => '2026-07-20T15:00:00.000Z',
      onPostCommitError,
    )
    await service.save({ ...correction, status: 'AVAILABLE_FOR_APPROVAL' })

    await expect(service.approveDay({
      supervisorId: 'supervisor-1', collaboratorId: 'collaborator-1', date: '2026-07-17',
      balanceMinutes: 0, justification: '', expectedVersion: correction.version,
    })).resolves.toMatchObject({ status: 'APPROVED' })
    await expect(service.getForDate('collaborator-1', '2026-07-17', true, correction.assignmentSnapshot)).resolves.toMatchObject({ status: 'APPROVED' })
    expect(onPostCommitError).toHaveBeenCalledOnce()
  })
})
