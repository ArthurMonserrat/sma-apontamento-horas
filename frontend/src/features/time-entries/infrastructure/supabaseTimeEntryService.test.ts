import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeSupabase, type FakeSupabase } from '../../corporate/testing/fakeSupabaseClient'
import type { CreateTimeEntryData } from '../types'
import { BANCO1_TIME_ENTRIES_TABLE, SupabaseTimeEntryService } from './supabaseTimeEntryService'
import { RuntimeTimeEntryService, type TimeEntryService } from './timeEntryService'

const ME = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const snapshot = { squadId: 'team-1', squadName: 'Automação', supervisorId: 'sup-1', supervisorName: 'Sup Um' }

const baseData: CreateTimeEntryData = {
  entryDate: '2026-10-26',
  clientName: 'Vale',
  projectCode: 'P-100',
  activityId: 'activity-1',
  disciplineCode: 'E',
  documentTypeCode: 'DE',
  durationMinutes: 480,
  details: 'Projeto elétrico',
}

let fake: FakeSupabase
let service: SupabaseTimeEntryService
const audit = { record: vi.fn(async () => undefined) }

beforeEach(() => {
  fake = createFakeSupabase()
  audit.record.mockClear()
  service = new SupabaseTimeEntryService({
    getClient: () => fake.client,
    resolveAssignment: async () => snapshot,
    audit,
  })
})

const rows = () => fake.tables.get(BANCO1_TIME_ENTRIES_TABLE) ?? []

describe('SupabaseTimeEntryService', () => {
  it('cria o apontamento no banco como pendente, com a equipe real e auditoria', async () => {
    const created = await service.create(ME, baseData)
    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toMatchObject({
      collaborator_id: ME, entry_date: '2026-10-26', client_name: 'Vale', project_code: 'P-100',
      discipline_code: 'E', document_type_code: 'DE', duration_minutes: 480, status: 'PENDING', assignment_snapshot: snapshot,
    })
    expect(rows()[0]).not.toHaveProperty('team_id', 'team-1')
    expect(created).toMatchObject({ collaboratorId: ME, status: 'PENDING', version: 1, assignmentSnapshot: snapshot })
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ type: 'TIME_ENTRY_CREATED', entityId: created.id }))
  })

  it('lança um período de dias úteis em uma única gravação', async () => {
    await service.create(ME, { ...baseData, entryDate: '2026-10-23', endDate: '2026-10-26', weekdaysOnly: true })
    expect(rows().map((row) => row.entry_date)).toEqual(['2026-10-23', '2026-10-26'])
    expect(fake.calls.filter((call) => call.op === 'insert')).toHaveLength(1)
  })

  it('aplica as mesmas validações do formulário antes de ir ao banco', async () => {
    await expect(service.create(ME, { ...baseData, clientName: '  ' })).rejects.toThrow('Informe um cliente válido.')
    expect(rows()).toHaveLength(0)
  })

  it('lista só o colaborador pedido, no período, em ordem', async () => {
    await service.create(ME, { ...baseData, entryDate: '2026-10-27' })
    await service.create(ME, { ...baseData, entryDate: '2026-10-20' })
    rows().push({ ...rows()[0], id: 'outro', collaborator_id: OTHER })
    const entries = await service.listByRange(ME, '2026-10-01', '2026-10-31')
    expect(entries.map((entry) => entry.entryDate)).toEqual(['2026-10-20', '2026-10-27'])
    expect(await service.listByDate(ME, '2026-10-27')).toHaveLength(1)
  })

  it('pagina o histórico com filtros e total', async () => {
    for (const day of ['20', '21', '22']) await service.create(ME, { ...baseData, entryDate: `2026-10-${day}` })
    await service.create(ME, { ...baseData, entryDate: '2026-10-23', projectCode: 'OUTRO' })
    const first = await service.list({ collaboratorId: ME, startDate: '2026-10-01', endDate: '2026-10-31', pageSize: 2, filters: { projectCode: 'p-1' } })
    expect(first.total).toBe(3)
    expect(first.items.map((entry) => entry.entryDate)).toEqual(['2026-10-22', '2026-10-21'])
    expect(first.nextCursor).toBe('2')
    const second = await service.list({ collaboratorId: ME, startDate: '2026-10-01', endDate: '2026-10-31', pageSize: 2, cursor: first.nextCursor!, filters: { projectCode: 'p-1' } })
    expect(second.items.map((entry) => entry.entryDate)).toEqual(['2026-10-20'])
    expect(second.nextCursor).toBeNull()
  })

  it('edita com a versão esperada e recusa versão antiga', async () => {
    const created = await service.create(ME, baseData)
    const updated = await service.update(ME, created.id, 1, { ...baseData, details: 'Novo texto' }, 'Ajuste')
    expect(updated).toMatchObject({ version: 2, details: 'Novo texto', lastEditReason: 'Ajuste' })
    await expect(service.update(ME, created.id, 1, baseData, 'De novo')).rejects.toThrow('A versão do apontamento foi alterada')
    await expect(service.update(ME, created.id, 2, baseData, '  ')).rejects.toThrow('Informe o motivo da edição.')
  })

  it('não altera apontamento aprovado', async () => {
    const created = await service.create(ME, baseData)
    rows()[0].status = 'APPROVED'
    await expect(service.update(ME, created.id, 1, baseData, 'Ajuste')).rejects.toThrow('aprovado não pode ser alterado')
  })

  it('cancela com motivo e duplica guardando a origem', async () => {
    const created = await service.create(ME, baseData)
    await expect(service.cancel(ME, created.id, 1, '')).rejects.toThrow('Informe o motivo do cancelamento.')
    const duplicate = await service.duplicate(ME, created.id, 1, { entryDate: '2026-10-27' })
    expect(duplicate).toMatchObject({ entryDate: '2026-10-27', sourceEntryId: created.id, status: 'PENDING' })
    const cancelled = await service.cancel(ME, created.id, 1, 'Lançado errado')
    expect(cancelled).toMatchObject({ status: 'CANCELLED', cancelReason: 'Lançado errado', version: 2 })
    expect(cancelled.cancelledAt).toBeTruthy()
    await expect(service.cancel(ME, created.id, 2, 'De novo')).rejects.toThrow('já está cancelado')
  })

  it('não deixa editar apontamento de outra pessoa', async () => {
    const created = await service.create(ME, baseData)
    await expect(service.update(OTHER, created.id, 1, baseData, 'x')).rejects.toThrow('Apontamento não encontrado')
    expect(await service.getById(OTHER, created.id)).toBeNull()
  })

  it('mostra a mensagem das regras do banco e esconde mensagens técnicas', async () => {
    fake.failNext({ code: '23514', message: 'Apontamento cancelado não pode ser alterado.' })
    await expect(service.create(ME, baseData)).rejects.toThrow('Apontamento cancelado não pode ser alterado.')
    fake.failNext({ code: '42501', message: 'new row violates row-level security policy for table "banco1_time_entries"' })
    await expect(service.create(ME, baseData)).rejects.toThrow('Você não tem permissão para esta operação.')
    fake.failNext({ code: 'XX000', message: 'relation does not exist' })
    await expect(service.listByDate(ME, '2026-10-26')).rejects.toThrow('Não foi possível carregar os apontamentos.')
  })

  it('respeita o bloqueio de dia fechado antes de gravar', async () => {
    const blocked = new SupabaseTimeEntryService({
      getClient: () => fake.client,
      resolveAssignment: async () => snapshot,
      mutationPolicy: { canMutate: async () => false },
    })
    await expect(blocked.create(ME, baseData)).rejects.toThrow('somente leitura')
    expect(rows()).toHaveLength(0)
  })

  it('sem sessão corporativa avisa para entrar de novo', async () => {
    const offline = new SupabaseTimeEntryService({ getClient: () => null })
    await expect(offline.listByDate(ME, '2026-10-26')).rejects.toThrow('Sessão corporativa indisponível')
  })
})

describe('RuntimeTimeEntryService', () => {
  it('usa o banco com login Microsoft e o armazenamento local no modo demonstração', async () => {
    const local = { listByDate: vi.fn(async () => []) } as unknown as TimeEntryService
    const remote = { listByDate: vi.fn(async () => []) } as unknown as TimeEntryService
    let corporate = false
    const runtime = new RuntimeTimeEntryService(local, remote, () => corporate)
    await runtime.listByDate(ME, '2026-10-26')
    corporate = true
    await runtime.listByDate(ME, '2026-10-26')
    expect(local.listByDate).toHaveBeenCalledTimes(1)
    expect(remote.listByDate).toHaveBeenCalledTimes(1)
  })
})
