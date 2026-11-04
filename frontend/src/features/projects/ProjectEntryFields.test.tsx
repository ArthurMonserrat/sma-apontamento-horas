// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectEntryFields } from './ProjectEntryFields'
import type { ProjectService } from './infrastructure/projectService'
import type { Project } from './types'

const activity = (id: string, name: string, executorId: string | null) => ({ id, name, complement: null, executorId, executorName: executorId, active: true })
const projects: Project[] = [
  { id: 'p1', code: '25A163E', supervisionCode: null, client: 'APPIAN', finalClient: null, location: null, marketSegment: null, description: 'Santa Rita', active: true,
    activities: [activity('a1', 'Curto-circuito', 'bruna'), activity('a2', 'Fluxo', 'sabrina'), activity('a3', 'Reuniões', null)] },
  { id: 'p2', code: '26A087E', supervisionCode: null, client: 'ARCELOR', finalClient: null, location: null, marketSegment: null, description: '', active: true,
    activities: [activity('a4', 'Seletividade', 'bruna')] },
]

let root: Root
let container: HTMLDivElement
const service = { list: vi.fn(async () => projects) } as unknown as ProjectService

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => { act(() => root.unmount()); container.remove() })

describe('ProjectEntryFields', () => {
  it('mostra só projetos e atividades da pessoa e avisa ao escolher', async () => {
    const onSelectProject = vi.fn()
    act(() => root.render(<ProjectEntryFields service={service} personId="sabrina" projectId="" projectActivityId="" onSelectProject={onSelectProject} onSelectActivity={vi.fn()} />))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    const projectSelect = container.querySelector<HTMLSelectElement>('#entry-project')!
    expect(Array.from(projectSelect.options).map((option) => option.value)).toEqual(['', 'p1'])
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(projectSelect, 'p1')
      projectSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onSelectProject).toHaveBeenCalledWith(projects[0], true)

    act(() => root.render(<ProjectEntryFields service={service} personId="sabrina" projectId="p1" projectActivityId="" error="Escolha a atividade do projeto." onSelectProject={onSelectProject} onSelectActivity={vi.fn()} />))
    const activitySelect = container.querySelector<HTMLSelectElement>('#entry-project-activity')!
    expect(Array.from(activitySelect.options).map((option) => option.textContent)).toEqual(['Selecione a atividade', 'Fluxo', 'Reuniões'])
    expect(container.textContent).toContain('Escolha a atividade do projeto.')
  })
})
