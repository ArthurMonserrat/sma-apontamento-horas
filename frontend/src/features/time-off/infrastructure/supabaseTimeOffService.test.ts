import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeSupabase, type FakeSupabase } from '../../corporate/testing/fakeSupabaseClient'
import { BANCO1_TIME_OFF_TABLE, SupabaseTimeOffService } from './supabaseTimeOffService'
import { RuntimeTimeOffService, type TimeOffService } from './timeOffService'

const ME = 'hamilton'
const snapshot = { squadId: 't1', squadName: 'S12 - RENATO', supervisorId: 'renato', supervisorName: 'Renato Resende' }
let fake: FakeSupabase
let service: SupabaseTimeOffService
const rows = () => fake.tables.get(BANCO1_TIME_OFF_TABLE) ?? []

beforeEach(() => {
  fake = createFakeSupabase()
  service = new SupabaseTimeOffService({ getClient: () => fake.client, resolveAssignment: async () => snapshot, today: () => '2026-10-28' })
})

describe('SupabaseTimeOffService', () => {
  it('pede ausência futura no banco, com a equipe real', async () => {
    const created = await service.create(ME, { absenceType: 'Férias', startDate: '2026-11-10', endDate: '2026-11-20', reason: ' Férias ', collaboratorName: 'Hamilton Junior' })
    expect(rows()[0]).toMatchObject({ collaborator_id: ME, absence_type: 'Férias', start_date: '2026-11-10', end_date: '2026-11-20', reason: 'Férias', assignment_snapshot: snapshot })
    expect(rows()[0]).not.toHaveProperty('status', 'APPROVED')
    expect(created).toMatchObject({ collaboratorName: 'Hamilton Junior', absenceType: 'Férias', startDate: '2026-11-10', endDate: '2026-11-20' })
  })

  it('valida data futura, retorno e justificativa antes de ir ao banco', async () => {
    await expect(service.create(ME, { startDate: '2026-10-28', reason: 'x' })).rejects.toThrow('data futura')
    await expect(service.create(ME, { startDate: '2026-11-10', endDate: '2026-11-01', reason: 'x' })).rejects.toThrow('data de retorno')
    await expect(service.create(ME, { startDate: '2026-11-10', reason: ' ' })).rejects.toThrow('justificativa')
    expect(rows()).toHaveLength(0)
  })

  it('lista as ausências que cruzam o período e só as aprovadas quando pedido', async () => {
    await service.create(ME, { startDate: '2026-11-10', endDate: '2026-11-20', reason: 'a' })
    await service.create(ME, { startDate: '2026-12-01', reason: 'b' })
    rows()[0].status = 'APPROVED'
    expect((await service.listByRange(ME, '2026-11-15', '2026-11-30')).map((item) => item.startDate)).toEqual(['2026-11-10'])
    expect(await service.listApprovedByRange(ME, '2026-11-01', '2026-12-31')).toHaveLength(1)
  })

  it('retira pedido pendente e cancela aprovada com motivo', async () => {
    const pending = await service.create(ME, { startDate: '2026-11-10', reason: 'a' })
    await expect(service.cancelApproved(ME, pending.id, 'x')).rejects.toThrow('Somente uma folga aprovada')
    expect(await service.removePending(ME, pending.id)).toMatchObject({ status: 'CANCELLED', cancellationReason: 'Solicitação retirada pelo colaborador' })
    const approved = await service.create(ME, { startDate: '2026-11-12', reason: 'b' })
    rows()[1].status = 'APPROVED'
    await expect(service.cancelApproved(ME, approved.id, ' ')).rejects.toThrow('Informe o motivo')
    expect(await service.cancelApproved(ME, approved.id, 'Mudou')).toMatchObject({ status: 'CANCELLED', cancellationReason: 'Mudou' })
  })

  it('decide pela função do banco e mostra a recusa do banco', async () => {
    const created = await service.create(ME, { startDate: '2026-11-10', reason: 'a' })
    fake.rpcs.set('banco1_decide_time_off', (args) => ({ data: [{ ...rows()[0], status: args.decision, rejection_reason: args.reason }], error: null }))
    expect(await service.approve('renato', created.id)).toMatchObject({ status: 'APPROVED' })
    expect(fake.calls.at(-1)).toMatchObject({ rpc: 'banco1_decide_time_off', payload: { request_id: created.id, decision: 'APPROVED', reason: null } })
    await expect(service.reject('renato', created.id, ' ')).rejects.toThrow('Informe o motivo da rejeição')
    fake.failNext({ code: '42501', message: 'Ausência fora da sua equipe.' })
    await expect(service.approve('outro', created.id)).rejects.toThrow('Ausência fora da sua equipe.')
  })
})

describe('RuntimeTimeOffService', () => {
  it('usa o banco com login Microsoft e o navegador na demonstração', async () => {
    const local = { listByRange: vi.fn(async () => []) } as unknown as TimeOffService
    const remote = { listByRange: vi.fn(async () => []) } as unknown as TimeOffService
    let corporate = false
    const runtime = new RuntimeTimeOffService(local, remote, () => corporate)
    await runtime.listByRange(ME, '2026-11-01', '2026-11-30')
    corporate = true
    await runtime.listByRange(ME, '2026-11-01', '2026-11-30')
    expect(local.listByRange).toHaveBeenCalledTimes(1)
    expect(remote.listByRange).toHaveBeenCalledTimes(1)
  })
})
