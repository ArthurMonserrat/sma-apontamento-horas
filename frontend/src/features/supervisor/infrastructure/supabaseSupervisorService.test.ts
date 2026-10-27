import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeSupabase, type FakeSupabase } from '../../corporate/testing/fakeSupabaseClient'
import type { CorporatePerson } from '../../corporate/corporateData'
import { BANCO1_TIME_ENTRIES_TABLE } from '../../time-entries/infrastructure/supabaseTimeEntryService'
import { SupabaseSupervisorService } from './supabaseSupervisorService'

const SUP = 'sup-1'
const ANA = 'ana-1'
const BRUNO = 'bruno-1'

const people: CorporatePerson[] = [
  { id: SUP, name: 'Sueli Supervisora', email: 's@x', role: 'supervisor', teamId: null, teamName: null, supervisorId: null, supervisorName: null },
  { id: ANA, name: 'Ana Souza', email: 'a@x', role: 'colaborador', teamId: 't1', teamName: 'Automação', supervisorId: SUP, supervisorName: 'Sueli Supervisora' },
  { id: BRUNO, name: 'Bruno Lima', email: 'b@x', role: 'colaborador', teamId: 't1', teamName: 'Automação', supervisorId: SUP, supervisorName: 'Sueli Supervisora' },
]

function row(id: string, collaborator: string, entryDate: string, status = 'PENDING', extra: Record<string, unknown> = {}) {
  return {
    id, collaborator_id: collaborator, entry_date: entryDate, client_name: 'Vale', project_code: 'P-1', activity_id: 'act',
    discipline_code: 'E', document_type_code: 'DE', duration_minutes: 480, details: 'd', status, version: 1,
    assignment_snapshot: null, cancel_reason: null, rejection_reason: null, decided_at: null, decided_by: null,
    created_at: `${entryDate}T10:00:00Z`, updated_at: `${entryDate}T10:00:00Z`, ...extra,
  }
}

let fake: FakeSupabase
let service: SupabaseSupervisorService
const timeOff = {
  listTimeOffRequests: vi.fn(async () => []),
  approveTimeOffRequest: vi.fn(),
  rejectTimeOffRequest: vi.fn(),
  getRequestSummary: vi.fn(async () => ({ pending: 0, approved: 0, rejected: 0 })),
}

beforeEach(() => {
  fake = createFakeSupabase()
  fake.tables.set(BANCO1_TIME_ENTRIES_TABLE, [
    row('e1', ANA, '2026-10-20'),
    row('e2', BRUNO, '2026-10-21', 'CANCELLED', { cancel_reason: 'Errado' }),
    row('e3', SUP, '2026-10-22'),
    row('e4', ANA, '2026-10-23', 'REJECTED', { rejection_reason: 'Detalhar' }),
  ])
  fake.rpcs.set('banco1_decide_time_entries', (args, tables) => {
    const ids = args.entry_ids as string[]
    const updated = (tables.get(BANCO1_TIME_ENTRIES_TABLE) ?? []).filter((item) => ids.includes(item.id as string))
    updated.forEach((item) => Object.assign(item, { status: args.decision, rejection_reason: args.reason ?? null, decided_by: SUP, decided_at: '2026-10-27T00:00:00Z' }))
    return { data: updated.map((item) => ({ ...item })), error: null }
  })
  service = new SupabaseSupervisorService({
    getClient: () => fake.client,
    timeOff,
    listPeople: async () => people,
    getUserId: () => SUP,
    daysUntilClosing: () => 10,
  })
})

describe('SupabaseSupervisorService', () => {
  it('lista os apontamentos visíveis com nome, sem os próprios, e mostra cancelado como rejeitado', async () => {
    const entries = await service.listEntries()
    expect(entries.map((entry) => entry.id)).toEqual(['e4', 'e2', 'e1'])
    expect(entries.find((entry) => entry.id === 'e1')).toMatchObject({ collaboratorName: 'Ana Souza', status: 'PENDING', escalated: false })
    expect(entries.find((entry) => entry.id === 'e2')).toMatchObject({ status: 'REJECTED', rejectionReason: 'Errado' })
    expect(entries.find((entry) => entry.id === 'e4')).toMatchObject({ status: 'REJECTED', rejectionReason: 'Detalhar' })
    expect(await service.getSummary()).toEqual({ pending: 1, approved: 0, rejected: 2 })
  })

  it('aprova e rejeita pela função do banco', async () => {
    const approved = await service.approve('e1', SUP)
    expect(approved).toMatchObject({ id: 'e1', status: 'APPROVED', decidedBy: SUP })
    expect(fake.calls.at(-1)).toMatchObject({ rpc: 'banco1_decide_time_entries', payload: { entry_ids: ['e1'], decision: 'APPROVED', reason: null } })
    await expect(service.reject('e1', SUP, '  ')).rejects.toThrow('Informe o motivo da rejeição.')
    const [rejected] = await service.rejectMany(['e1'], SUP, 'Faltou detalhe')
    expect(rejected).toMatchObject({ status: 'REJECTED', rejectionReason: 'Faltou detalhe' })
  })

  it('repassa a mensagem do banco quando a decisão é recusada', async () => {
    fake.failNext({ code: '42501', message: 'Apontamento fora da sua equipe.' })
    await expect(service.approve('e1', SUP)).rejects.toThrow('Apontamento fora da sua equipe.')
  })

  it('escala pendências perto do fechamento para a diretoria', async () => {
    const closing = new SupabaseSupervisorService({ getClient: () => fake.client, timeOff, listPeople: async () => people, getUserId: () => 'diretor', daysUntilClosing: () => 1 })
    expect((await closing.listEscalatedEntries()).map((entry) => entry.id)).toEqual(['e3', 'e1'])
    await expect(closing.approveEscalated('e4', 'diretor')).rejects.toThrow('não está na fila escalada')
  })

  it('lista colaboradores visíveis sem o próprio usuário e delega folgas', async () => {
    expect((await service.listCollaborators()).map((person) => person.name)).toEqual(['Ana Souza', 'Bruno Lima'])
    await service.listTimeOffRequests(SUP)
    expect(timeOff.listTimeOffRequests).toHaveBeenCalledWith(SUP)
  })
})
