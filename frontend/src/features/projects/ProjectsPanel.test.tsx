// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CorporatePerson } from '../corporate/corporateData'
import { ProjectsPanel } from './ProjectsPanel'
import { connectionText, oneDriveReturnMessage, syncText } from './projectSyncText'
import type { ProjectService } from './infrastructure/projectService'
import type { Project } from './types'

const sabrina: CorporatePerson = { id: 'sabrina', name: 'Sabrina Drumond', email: 's@x', role: 'colaborador', teamId: null, teamName: null, supervisorId: null, supervisorName: null, jobTitle: null }

let root: Root
let container: HTMLDivElement
let projects: Project[]
let service: ProjectService

const flush = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) }) }
const button = (label: string) => Array.from(container.querySelectorAll('button')).find((item) => item.textContent === label)!
function type(input: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
}
const field = (label: string) => Array.from(container.querySelectorAll('label')).find((item) => item.textContent?.startsWith(label))!.querySelector('input, select') as HTMLInputElement

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  projects = [{
    id: 'p1', code: '25A163E', supervisionCode: 'S2-BAA', client: 'APPIAN CAPITAL', finalClient: null, location: 'Itagibá/BA', marketSegment: 'Mineração', description: 'Estudos ONS', active: true,
    activities: [{ id: 'a1', name: 'Curto-circuito', complement: null, executorId: null, executorName: 'Fulano', active: true }],
  }]
  service = {
    list: vi.fn(async () => projects),
    save: vi.fn(async () => ({ projectIds: ['p2'], projectsCreated: 1, projectsUpdated: 0, activitiesSaved: 1, activitiesRemoved: 0, unmatchedExecutors: [] })),
    setActive: vi.fn(async () => undefined),
    lastSync: vi.fn(async () => null),
    oneDriveStatus: vi.fn(async () => ({ accountEmail: 'paulo.porto@sma-eng.com.br', accountName: 'Paulo Porto', connectedAt: '2026-11-10T12:00:00Z', status: 'ativa' })),
    oneDriveConnectUrl: vi.fn(async () => 'https://login.microsoftonline.com/x/authorize'),
    syncNow: vi.fn(async () => ({ status: 'ok', summary: { projects_created: 3, projects_updated: 1, projects_deactivated: 2, activities_removed: 0, unmatched_executors: ['Alan Franklin'] } })),
  } as unknown as ProjectService
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('ProjectsPanel', () => {
  it('sincroniza com o OneDrive na hora e mostra o resultado', async () => {
    act(() => root.render(<ProjectsPanel service={service} loadPeople={async () => []} />))
    await flush()
    expect(container.textContent).toContain('Ainda não sincronizado')
    expect(container.textContent).toContain('Conectado ao OneDrive de Paulo Porto')
    await act(async () => button('Sincronizar agora').click())
    await flush()
    expect(service.syncNow).toHaveBeenCalled()
    expect(container.textContent).toContain('Sincronizado com o OneDrive: 3 projeto(s) novo(s), 1 atualizado(s), 2 desativado(s)')
    expect(container.textContent).toContain('Alan Franklin')
  })

  it('mostra erro da sincronização', async () => {
    service.syncNow = vi.fn(async () => { throw new Error('Sincronização com o OneDrive ainda não configurada (faltam: PROJECTS_SYNC_SITE_URL).') })
    act(() => root.render(<ProjectsPanel service={service} loadPeople={async () => []} />))
    await flush()
    await act(async () => button('Sincronizar agora').click())
    await flush()
    expect(container.textContent).toContain('ainda não configurada')
  })

  it('conectar OneDrive abre o login da Microsoft', async () => {
    service.oneDriveStatus = vi.fn(async () => null)
    const openUrl = vi.fn()
    act(() => root.render(<ProjectsPanel service={service} loadPeople={async () => []} openUrl={openUrl} />))
    await flush()
    expect(container.textContent).toContain('OneDrive não conectado')
    expect(button('Sincronizar agora').disabled).toBe(true)
    await act(async () => button('Conectar OneDrive').click())
    await flush()
    expect(openUrl).toHaveBeenCalledWith('https://login.microsoftonline.com/x/authorize')
  })

  it('mostra o resultado da volta do login', async () => {
    act(() => root.render(<ProjectsPanel service={service} loadPeople={async () => []} returnParams={new URLSearchParams('onedrive=erro&motivo=admin')} />))
    await flush()
    expect(container.textContent).toContain('aprovação de um administrador')
    expect(container.textContent).toContain('Conectado ao OneDrive de Paulo Porto (paulo.porto@sma-eng.com.br)')
    expect(button('Reconectar OneDrive')).toBeTruthy()
  })

  it('textos da conexão e da volta do login', () => {
    expect(connectionText({ accountEmail: 'p@x', accountName: null, connectedAt: '2026-11-10T12:00:00Z', status: 'expirada', lastError: null })).toContain('expirou')
    expect(oneDriveReturnMessage(new URLSearchParams('onedrive=conectado&conta=p%40x&arquivo=nao-encontrado'))).toMatchObject({ kind: 'aviso' })
    expect(oneDriveReturnMessage(new URLSearchParams('onedrive=conectado&conta=p%40x&arquivo=ok'))?.text).toContain('OneDrive conectado com p@x')
    expect(oneDriveReturnMessage(new URLSearchParams('onedrive=erro&motivo=xyz'))?.text).toContain('Tente de novo')
    expect(oneDriveReturnMessage(new URLSearchParams(''))).toBeNull()
  })

  it('descreve a última sincronização', () => {
    expect(syncText({ startedAt: '2026-11-10T10:00:00Z', trigger: 'agendado', status: 'ok', fileModifiedAt: '2026-11-09T21:30:00Z', error: null, summary: null }))
      .toBe('Última sincronização em 10/11/2026, 07:00 (automática) · arquivo salvo em 09/11/2026, 18:30.')
    expect(syncText({ startedAt: '2026-11-10T16:00:00Z', trigger: 'manual', status: 'erro', fileModifiedAt: null, error: 'Arquivo não encontrado', summary: null }))
      .toBe('Última tentativa em 10/11/2026, 13:00 (manual) falhou: Arquivo não encontrado')
    expect(syncText({ startedAt: '2026-11-10T16:00:00Z', trigger: 'agendado', status: 'sem_mudancas', fileModifiedAt: null, error: null, summary: null }))
      .toContain('sem mudanças no arquivo')
  })

  it('importa do banco SQLite escolhendo as situações', async () => {
    const readSqlite = vi.fn(async () => ({
      statuses: [{ status: 'Concluído', count: 1 }, { status: 'Em andamento', count: 1 }],
      projects: [
        { code: '26A079S', status: 'Em andamento', client: 'AP', supervisionCode: null, finalClient: null, location: null, marketSegment: null, description: '', active: true, activities: [{ name: 'Fluxo', complement: null, executorName: 'Giuliano' }] },
        { code: '24A001E', status: 'Concluído', client: 'VALE', supervisionCode: null, finalClient: null, location: null, marketSegment: null, description: '', active: false, activities: [] },
      ],
    }))
    act(() => root.render(<ProjectsPanel service={service} loadPeople={async () => []} readSqlite={readSqlite} />))
    await flush()
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Banco SQLite de projetos"]')!
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'ESTUDOS.sqlite')], configurable: true })
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    await flush()
    expect(container.textContent).toContain('Prévia da importação (banco SQLite)')
    expect(container.textContent).toContain('26A079S')
    expect(container.textContent).not.toContain('24A001E')
    const concluded = Array.from(container.querySelectorAll('label')).find((label) => label.textContent?.startsWith('Concluído'))!.querySelector('input')!
    act(() => concluded.click())
    expect(container.textContent).toContain('24A001E(inativo)')
    await act(async () => button('Confirmar importação').click())
    await flush()
    expect(service.save).toHaveBeenCalledWith([
      { code: '26A079S', client: 'AP', supervisionCode: null, finalClient: null, location: null, marketSegment: null, description: '', active: true, activities: [{ name: 'Fluxo', complement: null, executorName: 'Giuliano' }] },
      { code: '24A001E', client: 'VALE', supervisionCode: null, finalClient: null, location: null, marketSegment: null, description: '', active: false, activities: [] },
    ], { replaceActivities: false })
    expect(container.textContent).toContain('Importação concluída')
  })

  it('lista projetos e mostra executor não encontrado', async () => {
    act(() => root.render(<ProjectsPanel service={service} loadPeople={async () => [sabrina]} />))
    await flush()
    expect(container.textContent).toContain('25A163E')
    expect(container.textContent).toContain('Estudos ONS')
    expect(container.textContent).toContain('Fulano (não encontrado)')
  })

  it('cadastra projeto com atividade e executor', async () => {
    act(() => root.render(<ProjectsPanel service={service} loadPeople={async () => [sabrina]} />))
    await flush()
    act(() => button('Novo projeto').click())
    act(() => type(field('Projeto (código)'), '26a079s'))
    act(() => type(field('Cliente'), 'AP'))
    act(() => type(field('Atividade 1'), 'Fluxo de Potência'))
    act(() => type(field('Executor'), 'sabrina'))
    await act(async () => button('Salvar projeto').click())
    await flush()
    expect(service.save).toHaveBeenCalledWith([expect.objectContaining({
      code: '26a079s', client: 'AP',
      activities: [{ name: 'Fluxo de Potência', complement: '', executorId: 'sabrina', executorName: null }],
    })], { replaceActivities: true })
    expect(container.textContent).toContain('Projeto salvo: 1 projeto(s) novo(s)')
  })

  it('não deixa criar código repetido e desativa projeto', async () => {
    act(() => root.render(<ProjectsPanel service={service} loadPeople={async () => []} />))
    await flush()
    act(() => button('Novo projeto').click())
    act(() => type(field('Projeto (código)'), '25a163e'))
    act(() => type(field('Cliente'), 'X'))
    await act(async () => button('Salvar projeto').click())
    expect(container.textContent).toContain('Já existe o projeto 25A163E')
    expect(service.save).not.toHaveBeenCalled()
    await act(async () => button('Desativar').click())
    await flush()
    expect(service.setActive).toHaveBeenCalledWith('p1', false)
  })
})
