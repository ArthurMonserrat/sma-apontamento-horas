import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeSupabase, type FakeSupabase } from '../../corporate/testing/fakeSupabaseClient'
import type { CorporatePerson } from '../../corporate/corporateData'
import { OnlineTeamService } from './onlineTeamService'

const people: CorporatePerson[] = [
  { id: 'renato', name: 'Renato Resende', email: 'r@x', role: 'supervisor', teamId: null, teamName: null, supervisorId: null, supervisorName: null, jobTitle: null },
  { id: 'hugo', name: 'Hugo Barbosa', email: 'h@x', role: 'colaborador', teamId: 't1', teamName: 'S12 - RENATO', supervisorId: 'renato', supervisorName: 'Renato Resende', jobTitle: null },
  { id: 'hamilton', name: 'Hamilton Junior', email: 'j@x', role: 'colaborador', teamId: 't1', teamName: 'S12 - RENATO', supervisorId: 'renato', supervisorName: 'Renato Resende', jobTitle: null },
]

let fake: FakeSupabase
let service: OnlineTeamService
const onChanged = vi.fn()

beforeEach(() => {
  fake = createFakeSupabase()
  onChanged.mockClear()
  fake.tables.set('teams', [
    { id: 't1', name: 'S12 - RENATO', supervisor_id: 'renato', module: 'BANCO_1', active: true },
    { id: 't0', name: 'Antiga', supervisor_id: null, module: 'BANCO_1', active: false },
    { id: 't2', name: 'Banco 2', supervisor_id: null, module: 'BANCO_2', active: true },
  ])
  fake.rpcs.set('banco1_save_team', () => ({ data: 't1', error: null }))
  fake.rpcs.set('banco1_deactivate_team', () => ({ data: null, error: null }))
  service = new OnlineTeamService({ getClient: () => fake.client, listPeople: async () => people, onChanged })
})

describe('OnlineTeamService', () => {
  it('lista só as supervisões ativas do Banco 1 com supervisor e colaboradores', async () => {
    const teams = await service.listTeams()
    expect(teams).toEqual([{ id: 't1', name: 'S12 - RENATO', supervisorId: 'renato', supervisorName: 'Renato Resende', members: [people[2], people[1]] }])
  })

  it('salva pela função do banco sem repetir pessoas nem incluir o supervisor como membro', async () => {
    await expect(service.saveTeam({ name: 'S12 - RENATO', supervisorId: 'renato', memberIds: ['hugo', 'hamilton', 'hugo', 'renato'] })).resolves.toBe('t1')
    expect(fake.calls.at(-1)).toMatchObject({ rpc: 'banco1_save_team', payload: { team_id: null, team_name: 'S12 - RENATO', supervisor: 'renato', member_ids: ['hugo', 'hamilton'] } })
    expect(onChanged).toHaveBeenCalled()
  })

  it('valida nome e supervisor antes de ir ao banco', async () => {
    await expect(service.saveTeam({ name: ' ', supervisorId: 'renato', memberIds: [] })).rejects.toThrow('Informe o nome da supervisão.')
    await expect(service.saveTeam({ name: 'X', supervisorId: '', memberIds: [] })).rejects.toThrow('Escolha o supervisor.')
    expect(fake.calls.filter((call) => call.rpc)).toHaveLength(0)
  })

  it('mostra a mensagem do banco quando não é diretoria', async () => {
    fake.failNext({ code: '42501', message: 'Somente a diretoria pode gerenciar supervisões.' })
    await expect(service.saveTeam({ name: 'X', supervisorId: 'renato', memberIds: [] })).rejects.toThrow('Somente a diretoria pode gerenciar supervisões.')
    fake.failNext({ code: '23505', message: 'Já existe uma supervisão com esse nome.' })
    await expect(service.saveTeam({ name: 'X', supervisorId: 'renato', memberIds: [] })).rejects.toThrow('Já existe uma supervisão com esse nome.')
  })

  it('desativa pela função do banco', async () => {
    await service.deactivateTeam('t1')
    expect(fake.calls.at(-1)).toMatchObject({ rpc: 'banco1_deactivate_team', payload: { team_id: 't1' } })
  })
})

describe('OnlineTeamService.setJobTitle', () => {
  it('salva o cargo pela função do banco (vazio apaga)', async () => {
    fake.rpcs.set('banco1_set_job_title', () => ({ data: null, error: null }))
    await service.setJobTitle('hugo', ' Engenheiro ')
    expect(fake.calls.at(-1)).toMatchObject({ rpc: 'banco1_set_job_title', payload: { target: 'hugo', job_title: 'Engenheiro' } })
    await service.setJobTitle('hugo', '  ')
    expect(fake.calls.at(-1)).toMatchObject({ payload: { target: 'hugo', job_title: null } })
    fake.failNext({ code: '42501', message: 'Somente a diretoria pode alterar o cargo.' })
    await expect(service.setJobTitle('hugo', 'X')).rejects.toThrow('Somente a diretoria pode alterar o cargo.')
  })
})
