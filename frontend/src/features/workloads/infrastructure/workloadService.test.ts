import { describe, expect, it, vi } from 'vitest'
import type { AuditEvent, SupervisorNotification } from '../../audit/types'
import type { AssignmentSnapshot } from '../../squads/types'
import { LocalWorkloadService } from './workloadService'
import type { StorageLike } from '../../../shared/infrastructure/storage/browserStorage'

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

const assignment: AssignmentSnapshot = {
  squadId: 'squad-automation', squadName: 'Engenharia de Automação', supervisorId: 'supervisor-demo-001', supervisorName: 'Jeen Carlos E. Azevedo',
}

function buildService(storage = new MemoryStorage()) {
  const audits: AuditEvent[] = []
  const notifications: SupervisorNotification[] = []
  const service = new LocalWorkloadService({
    storage, createId: (() => { let id = 0; return () => `id-${++id}` })(), now: () => '2026-07-20T12:00:00.000Z',
    today: () => '2026-07-20', resolveAssignment: () => assignment,
    audit: { record: async (event) => { audits.push(event) } },
    notifications: { record: async (notification) => { notifications.push(notification) } },
  })
  return { service, audits, notifications }
}

describe('carga horária e solicitações', () => {
  it('permite primeiro cadastro obrigatório quando a carga está ausente', async () => {
    const { service } = buildService()
    expect(await service.getCurrent('collaborator-1', '2026-07-20')).toBeNull()
    const created = await service.createInitial('collaborator-1', 480, '2026-07-20')
    expect(created).toMatchObject({ dailyMinutes: 480, effectiveFrom: '2026-07-20', status: 'APPROVED' })
    await expect(service.createInitial('collaborator-1', 360, '2026-07-20')).rejects.toThrow('já possui')
  })

  it('cria solicitação pendente e mantém carga atual vigente', async () => {
    const { service, audits, notifications } = buildService()
    await service.createInitial('collaborator-1', 480, '2026-07-01')
    const request = await service.requestChange('collaborator-1', {
      requestedDailyMinutes: 360, requestedEffectiveFrom: '2026-08-01', justification: 'Adequação contratual',
    })
    expect(request).toMatchObject({ status: 'PENDING', requestedDailyMinutes: 360, assignmentSnapshot: assignment })
    expect((await service.getCurrent('collaborator-1', '2026-08-01'))?.dailyMinutes).toBe(480)
    expect(audits.map((event) => event.type)).toContain('WORKLOAD_CHANGE_REQUESTED')
    expect(notifications.map((notification) => notification.type)).toEqual(['WORKLOAD_CHANGE_REQUESTED'])
  })

  it('bloqueia início pretendido no passado e justificativa vazia', async () => {
    const { service } = buildService()
    await service.createInitial('collaborator-1', 480, '2026-07-01')
    await expect(service.requestChange('collaborator-1', { requestedDailyMinutes: 360, requestedEffectiveFrom: '2026-07-19', justification: 'Mudança' })).rejects.toThrow('passado')
    await expect(service.requestChange('collaborator-1', { requestedDailyMinutes: 360, requestedEffectiveFrom: '2026-08-01', justification: '  ' })).rejects.toThrow('justificativa')
  })

  it('aplica versão aprovada apenas na nova vigência sem recalcular o passado', async () => {
    const { service } = buildService()
    await service.createInitial('collaborator-1', 480, '2026-07-01')
    const request = await service.requestChange('collaborator-1', { requestedDailyMinutes: 360, requestedEffectiveFrom: '2026-08-01', justification: 'Adequação' })
    await service.applyApprovedRequest(request.id, '2026-08-01', 'supervisor-demo-001')
    expect((await service.getCurrent('collaborator-1', '2026-07-31'))?.dailyMinutes).toBe(480)
    expect((await service.getCurrent('collaborator-1', '2026-08-01'))?.dailyMinutes).toBe(360)
  })

  it('rejeita solicitação com justificativa, auditoria e sem criar nova versão', async () => {
    const { service, audits } = buildService()
    await service.createInitial('collaborator-1', 480, '2026-07-01')
    const request = await service.requestChange('collaborator-1', { requestedDailyMinutes: 360, requestedEffectiveFrom: '2026-08-01', justification: 'Adequação' })

    const rejected = await service.rejectRequest(request.id, 'Contrato não alterado', 'supervisor-demo-001')

    expect(rejected).toMatchObject({ status: 'REJECTED', rejectionReason: 'Contrato não alterado' })
    expect(await service.listVersions('collaborator-1')).toHaveLength(1)
    expect(audits.map((event) => event.type)).toContain('WORKLOAD_CHANGE_REJECTED')
  })

  it('preserva solicitação confirmada quando efeitos secundários falham', async () => {
    const storage = new MemoryStorage()
    const onPostCommitError = vi.fn()
    const service = new LocalWorkloadService({
      storage,
      createId: (() => { let id = 0; return () => `failure-${++id}` })(),
      now: () => '2026-07-20T12:00:00.000Z',
      today: () => '2026-07-20',
      resolveAssignment: () => assignment,
      audit: { record: async () => { throw new Error('audit failure') } },
      notifications: { record: async () => { throw new Error('notification failure') } },
      onPostCommitError,
    })
    await service.createInitial('collaborator-1', 480, '2026-07-01')

    await expect(service.requestChange('collaborator-1', {
      requestedDailyMinutes: 360,
      requestedEffectiveFrom: '2026-08-01',
      justification: 'Adequação',
    })).resolves.toMatchObject({ status: 'PENDING' })
    await expect(service.listRequests('collaborator-1')).resolves.toHaveLength(1)
    expect(onPostCommitError).toHaveBeenCalledTimes(2)
  })
})
