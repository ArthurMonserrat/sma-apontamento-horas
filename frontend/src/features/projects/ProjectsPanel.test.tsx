// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CorporatePerson } from '../corporate/corporateData'
import { ProjectsPanel } from './ProjectsPanel'
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
  } as unknown as ProjectService
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('ProjectsPanel', () => {
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
