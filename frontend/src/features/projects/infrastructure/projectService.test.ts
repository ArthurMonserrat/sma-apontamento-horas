import { describe, expect, it, vi } from 'vitest'
import { createFakeSupabase } from '../../corporate/testing/fakeSupabaseClient'
import { ProjectService } from './projectService'
import { activitiesForPerson } from '../types'

function setup() {
  const fake = createFakeSupabase()
  fake.tables.set('banco1_projects', [
    { id: 'p1', code: '25A163E', supervision_code: 'S2-BAA', client: 'APPIAN', final_client: null, location: null, market_segment: null, description: 'Santa Rita', active: true,
      activities: [
        { id: 'a2', name: 'Fluxo', complement: null, executor_id: 'sabrina', executor_name: 'Sabrina', active: true },
        { id: 'a1', name: 'Curto', complement: 'ONS', executor_id: 'bruna', executor_name: 'Bruna', active: true },
        { id: 'a3', name: 'Reuniões', complement: null, executor_id: null, executor_name: null, active: true },
        { id: 'a4', name: 'Antiga', complement: null, executor_id: 'sabrina', executor_name: 'Sabrina', active: false },
      ] },
    { id: 'p2', code: 'OLD', supervision_code: null, client: 'X', final_client: null, location: null, market_segment: null, description: null, active: false, activities: [] },
  ])
  return { fake, service: new ProjectService(() => fake.client) }
}

describe('ProjectService', () => {
  it('lista projetos ativos com atividades ordenadas', async () => {
    const { service } = setup()
    const projects = await service.list()
    expect(projects.map((project) => project.code)).toEqual(['25A163E'])
    expect(projects[0].activities.map((activity) => activity.id)).toEqual(['a4', 'a1', 'a2', 'a3'])
    expect(activitiesForPerson(projects[0], 'sabrina').map((activity) => activity.id)).toEqual(['a2', 'a3'])
    expect(await service.list({ includeInactive: true })).toHaveLength(2)
  })

  it('salva pela função do banco enviando só os campos informados', async () => {
    const { fake, service } = setup()
    fake.rpcs.set('banco1_save_projects', () => ({ data: { project_ids: ['p9'], projects_created: 1, projects_updated: 0, activities_saved: 1, activities_removed: 0, unmatched_executors: ['Fulano'] }, error: null }))
    const result = await service.save([{ code: ' 26a079s ', client: ' AP ', activities: [{ name: 'Fluxo', executorName: 'Fulano' }, { name: '  ' }] }], { replaceActivities: false })
    expect(result).toEqual({ projectIds: ['p9'], projectsCreated: 1, projectsUpdated: 0, activitiesSaved: 1, activitiesRemoved: 0, unmatchedExecutors: ['Fulano'] })
    expect(fake.calls.at(-1)).toEqual({ rpc: 'banco1_save_projects', op: 'rpc', payload: {
      projects: [{ code: '26A079S', client: 'AP', activities: [{ name: 'Fluxo', complement: null, executor_id: null, executor_name: 'Fulano' }] }],
      replace_activities: false,
    } })
  })

  it('valida código e cliente antes de chamar o banco', async () => {
    const { fake, service } = setup()
    await expect(service.save([{ code: '', client: 'A', activities: [] }], { replaceActivities: true })).rejects.toThrow('código')
    await expect(service.save([{ code: 'A1', client: ' ', activities: [] }], { replaceActivities: true })).rejects.toThrow('cliente do projeto A1')
    expect(fake.calls).toHaveLength(0)
  })

  it('mostra a mensagem do banco quando não é diretoria', async () => {
    const { fake, service } = setup()
    fake.rpcs.set('banco1_save_projects', () => ({ data: null, error: { message: 'Somente a diretoria pode cadastrar projetos.', code: '42501' } }))
    await expect(service.save([{ code: 'A1', client: 'A', activities: [] }], { replaceActivities: true })).rejects.toThrow()
    fake.rpcs.set('banco1_set_project_active', () => ({ data: null, error: null }))
    await service.setActive('p1', false)
    expect(fake.calls.at(-1)).toMatchObject({ rpc: 'banco1_set_project_active', payload: { project_id: 'p1', active: false } })
  })

  it('lê a última sincronização e pede a sincronização ao servidor com a sessão', async () => {
    const { fake, service } = setup()
    expect(await service.lastSync()).toBeNull()
    fake.tables.set('banco1_project_sync_runs', [
      { started_at: '2026-11-10T10:00:00Z', trigger: 'agendado', status: 'ok', file_modified_at: null, error: null, summary: { projects_created: 1 } },
    ])
    expect(await service.lastSync()).toMatchObject({ trigger: 'agendado', status: 'ok', summary: { projects_created: 1 } })

    const client = { auth: { getSession: async () => ({ data: { session: { access_token: 'jwt' } } }) } }
    const withSession = new ProjectService(() => client as never)
    const doFetch = vi.fn(async () => new Response(JSON.stringify({ status: 'ok', summary: { projects_created: 2 } }), { status: 200 }))
    expect(await withSession.syncNow(doFetch as unknown as typeof fetch)).toEqual({ status: 'ok', summary: { projects_created: 2 } })
    expect(doFetch).toHaveBeenCalledWith('/api/projects-sync', { method: 'POST', headers: { Authorization: 'Bearer jwt' } })
    const failing = vi.fn(async () => new Response(JSON.stringify({ error: 'Somente a diretoria pode sincronizar os projetos.' }), { status: 403 }))
    await expect(withSession.syncNow(failing as unknown as typeof fetch)).rejects.toThrow('Somente a diretoria')
    const connect = vi.fn(async () => new Response(JSON.stringify({ url: 'https://login.microsoftonline.com/x' }), { status: 200 }))
    expect(await withSession.oneDriveConnectUrl(connect as unknown as typeof fetch)).toBe('https://login.microsoftonline.com/x')
    expect(connect).toHaveBeenCalledWith('/api/projects-sync?action=connect', expect.objectContaining({ method: 'POST' }))
    fake.rpcs.set('banco1_onedrive_status', () => ({ data: [{ account_email: 'p@x', account_name: 'Paulo', connected_at: '2026-11-10T12:00:00Z', status: 'ativa', last_error: null }], error: null }))
    expect(await service.oneDriveStatus()).toMatchObject({ accountEmail: 'p@x', status: 'ativa' })
  })
})
