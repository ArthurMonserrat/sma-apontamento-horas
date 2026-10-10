import { describe, expect, it, vi } from 'vitest'
import type { AuditEvent, SupervisorNotification } from '../../audit/types'
import type { AssignmentSnapshot } from '../../squads/types'
import {
  LocalTimeOffService,
  TIME_OFF_STORAGE_KEY,
  type TimeOffStorage,
} from './timeOffService'
import type { StorageLike } from '../../../shared/infrastructure/storage/browserStorage'

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

const assignment: AssignmentSnapshot = {
  squadId: 'squad-automation', squadName: 'Engenharia de Automação',
  supervisorId: 'supervisor-demo-001', supervisorName: 'Jeen Carlos E. Azevedo',
}

function buildService(storage: StorageLike, today = '2026-07-20') {
  const audits: AuditEvent[] = []
  const notifications: SupervisorNotification[] = []
  const service = new LocalTimeOffService({
    storage,
    createId: () => 'time-off-1',
    now: () => '2026-07-20T12:00:00.000Z',
    today: () => today,
    resolveAssignment: () => assignment,
    audit: { record: async (event) => { audits.push(event) } },
    notifications: { record: async (notification) => { notifications.push(notification) } },
  })
  return { service, audits, notifications }
}

function approvedStorage(date = '2026-07-25'): TimeOffStorage {
  return {
    version: 1,
    requests: [{
      id: 'approved-1', collaboratorId: 'collaborator-1', date, reason: 'Compromisso pessoal', status: 'APPROVED',
      assignmentSnapshot: assignment, createdAt: '2026-07-01T12:00:00.000Z', updatedAt: '2026-07-02T12:00:00.000Z', decidedAt: '2026-07-02T12:00:00.000Z',
    }],
  }
}

describe('LocalTimeOffService', () => {
  it('cria solicitação futura pendente com snapshot e notificação', async () => {
    const storage = new MemoryStorage()
    const { service, audits, notifications } = buildService(storage)
    const created = await service.create('collaborator-1', { date: '2026-07-25', reason: '  Compromisso familiar  ' })
    expect(created).toMatchObject({ status: 'PENDING', date: '2026-07-25', reason: 'Compromisso familiar', assignmentSnapshot: assignment })
    expect(audits.map((event) => event.type)).toEqual(['TIME_OFF_REQUESTED'])
    expect(notifications.map((notification) => notification.type)).toEqual(['TIME_OFF_REQUESTED'])
  })

  it('grava ausência na chave compartilhada ausencias_sma com campos de aprovação', async () => {
    const storage = new MemoryStorage()
    const { service } = buildService(storage)

    await service.create('collaborator-1', {
      absenceType: 'Férias',
      startDate: '2026-07-25',
      endDate: '2026-07-28',
      reason: 'Descanso programado',
      collaboratorName: 'Ana Lima',
    })

    const persisted = JSON.parse(storage.getItem(TIME_OFF_STORAGE_KEY) ?? '[]') as Array<Record<string, unknown>>
    expect(TIME_OFF_STORAGE_KEY).toBe('ausencias_sma')
    expect(persisted).toEqual([expect.objectContaining({
      id: 'time-off-1',
      colaborador: 'Ana Lima',
      colaboradorId: 'collaborator-1',
      tipo: 'Férias',
      dataInicio: '2026-07-25',
      dataRetorno: '2026-07-28',
      justificativa: 'Descanso programado',
      status: 'Pendente',
    })])
  })

  it('aprova ausencia gravada no formato simples da chave compartilhada', async () => {
    const storage = new MemoryStorage()
    storage.setItem(TIME_OFF_STORAGE_KEY, JSON.stringify([{
      id: 'absence-raw-1',
      colaborador: 'Ana Lima',
      colaboradorId: 'collaborator-1',
      tipo: 'FÃ©rias',
      dataInicio: '2026-07-25',
      dataRetorno: '2026-07-28',
      justificativa: 'Descanso programado',
      status: 'Pendente',
    }]))
    const { service } = buildService(storage)

    const approved = await service.approve('supervisor-demo-001', 'absence-raw-1')

    expect(approved.status).toBe('APPROVED')
    const persisted = JSON.parse(storage.getItem(TIME_OFF_STORAGE_KEY) ?? '[]') as Array<Record<string, unknown>>
    expect(persisted[0]).toMatchObject({ id: 'absence-raw-1', status: 'Aprovado' })
  })

  it('bloqueia solicitação para hoje ou para o passado', async () => {
    const { service } = buildService(new MemoryStorage())
    await expect(service.create('collaborator-1', { date: '2026-07-20', reason: 'Compromisso' })).rejects.toThrow('futura')
    await expect(service.create('collaborator-1', { date: '2026-07-19', reason: 'Compromisso' })).rejects.toThrow('futura')
  })

  it('exige justificativa e squad ativa', async () => {
    const storage = new MemoryStorage()
    const { service } = buildService(storage)
    await expect(service.create('collaborator-1', { date: '2026-07-25', reason: '  ' })).rejects.toThrow('justificativa')
    const withoutSquad = new LocalTimeOffService({ storage, today: () => '2026-07-20', resolveAssignment: () => null })
    await expect(withoutSquad.create('collaborator-1', { date: '2026-07-25', reason: 'Compromisso' })).rejects.toThrow('squad ativa')
  })

  it('exclui logicamente solicitação pendente futura', async () => {
    const storage = new MemoryStorage()
    const { service } = buildService(storage)
    const created = await service.create('collaborator-1', { date: '2026-07-25', reason: 'Compromisso' })
    const removed = await service.removePending('collaborator-1', created.id)
    expect(removed.status).toBe('CANCELLED')
    expect(await service.listByRange('collaborator-1', '2026-07-01', '2026-07-31')).toHaveLength(1)
  })

  it('cancela folga aprovada futura, notifica supervisor e preserva auditoria', async () => {
    const storage = new MemoryStorage()
    storage.setItem(TIME_OFF_STORAGE_KEY, JSON.stringify(approvedStorage()))
    const { service, audits, notifications } = buildService(storage)
    const cancelled = await service.cancelApproved('collaborator-1', 'approved-1', 'Planejamento alterado')
    expect(cancelled).toMatchObject({ status: 'CANCELLED', cancellationReason: 'Planejamento alterado' })
    expect(audits.map((event) => event.type)).toEqual(['TIME_OFF_CANCELLED'])
    expect(notifications.map((notification) => notification.type)).toEqual(['TIME_OFF_CANCELLED'])
  })

  it('permite que somente o supervisor do snapshot aprove a folga e registra auditoria', async () => {
    const storage = new MemoryStorage()
    const { service, audits } = buildService(storage)
    const created = await service.create('collaborator-1', { date: '2026-07-25', reason: 'Compromisso' })

    await expect(service.approve('outro-supervisor', created.id)).rejects.toThrow('supervisor')
    const approved = await service.approve('supervisor-demo-001', created.id)

    expect(approved).toMatchObject({ status: 'APPROVED', decidedAt: '2026-07-20T12:00:00.000Z' })
    expect(audits.map((event) => event.type)).toEqual(['TIME_OFF_REQUESTED', 'TIME_OFF_APPROVED'])
  })

  it('bloqueia cancelamento direto quando a data já ocorreu', async () => {
    const storage = new MemoryStorage()
    storage.setItem(TIME_OFF_STORAGE_KEY, JSON.stringify(approvedStorage('2026-07-20')))
    const { service } = buildService(storage)
    await expect(service.cancelApproved('collaborator-1', 'approved-1', 'Planejamento alterado')).rejects.toThrow('já ocorreu')
  })

  it('retira folga cancelada da coleção efetiva usada na projeção', async () => {
    const storage = new MemoryStorage()
    storage.setItem(TIME_OFF_STORAGE_KEY, JSON.stringify(approvedStorage()))
    const { service } = buildService(storage)
    expect(await service.listApprovedByRange('collaborator-1', '2026-07-01', '2026-07-31')).toHaveLength(1)
    await service.cancelApproved('collaborator-1', 'approved-1', 'Planejamento alterado')
    expect(await service.listApprovedByRange('collaborator-1', '2026-07-01', '2026-07-31')).toEqual([])
  })

  it('preserva solicitação confirmada quando auditoria e notificação falham', async () => {
    const storage = new MemoryStorage()
    const onPostCommitError = vi.fn()
    const service = new LocalTimeOffService({
      storage,
      createId: () => 'time-off-failure',
      now: () => '2026-07-20T12:00:00.000Z',
      today: () => '2026-07-20',
      resolveAssignment: () => assignment,
      audit: { record: async () => { throw new Error('audit failure') } },
      notifications: { record: async () => { throw new Error('notification failure') } },
      onPostCommitError,
    })

    await expect(service.create('collaborator-1', { date: '2026-07-25', reason: 'Compromisso' })).resolves.toMatchObject({ id: 'time-off-failure' })
    await expect(service.listByRange('collaborator-1', '2026-07-01', '2026-07-31')).resolves.toHaveLength(1)
    expect(onPostCommitError).toHaveBeenCalledTimes(2)
  })
})
