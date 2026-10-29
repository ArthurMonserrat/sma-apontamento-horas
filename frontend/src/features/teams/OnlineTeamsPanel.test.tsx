// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CorporatePerson } from '../corporate/corporateData'
import { OnlineTeamsPanel } from './OnlineTeamsPanel'
import type { OnlineTeam, OnlineTeamService } from './infrastructure/onlineTeamService'

const renato: CorporatePerson = { id: 'renato', name: 'Renato Resende', email: 'renato@x', role: 'colaborador', teamId: null, teamName: null, supervisorId: null, supervisorName: null, jobTitle: null }
const hugo: CorporatePerson = { id: 'hugo', name: 'Hugo Barbosa', email: 'hugo@x', role: 'colaborador', teamId: null, teamName: null, supervisorId: null, supervisorName: null, jobTitle: null }
const hamilton: CorporatePerson = { id: 'hamilton', name: 'Hamilton Junior', email: 'hamilton@x', role: 'colaborador', teamId: 'old', teamName: 'Antiga', supervisorId: null, supervisorName: null, jobTitle: null }

let root: Root
let container: HTMLDivElement
let teams: OnlineTeam[]
let service: OnlineTeamService

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  teams = []
  service = {
    listPeopleForTeams: vi.fn(async () => [renato, hugo, hamilton]),
    listTeams: vi.fn(async () => teams),
    saveTeam: vi.fn(async () => {
      teams = [{ id: 't1', name: 'S12 - RENATO', supervisorId: 'renato', supervisorName: 'Renato Resende', coSupervisorIds: [], coSupervisorNames: [], members: [hamilton, hugo] }]
      return 't1'
    }),
    deactivateTeam: vi.fn(),
    setJobTitle: vi.fn(async (_id: string, title: string) => { hamilton.jobTitle = title }),
  } as unknown as OnlineTeamService
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function setValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value)
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
}

const button = (label: string) => Array.from(container.querySelectorAll('button')).find((item) => item.textContent?.includes(label))!

describe('OnlineTeamsPanel', () => {
  it('cria a supervisão do Renato com Hugo e Hamilton e mostra na lista', async () => {
    await act(async () => { root.render(<OnlineTeamsPanel service={service} />) })
    expect(container.textContent).toContain('Nenhuma supervisão cadastrada ainda.')

    await act(async () => { button('Nova supervisão').click() })
    await act(async () => { setValue(container.querySelector('input[type="text"]')!, 'S12 - RENATO') })
    await act(async () => { setValue(container.querySelector('select')!, 'renato') })
    expect(container.textContent).toContain('passará a supervisor ao salvar')
    expect(container.textContent).toContain('Hoje em Antiga')

    const boxes = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).filter((box) => !box.getAttribute('aria-label')?.startsWith('Supervisor adicional'))
    expect(boxes).toHaveLength(2)
    await act(async () => { boxes.forEach((box) => box.click()) })
    expect(container.textContent).toContain('será movido')

    await act(async () => { button('Salvar no banco').click() })
    expect(service.saveTeam).toHaveBeenCalledWith({ name: 'S12 - RENATO', supervisorId: 'renato', coSupervisorIds: [], memberIds: ['hamilton', 'hugo'] })
    expect(container.textContent).toContain('Supervisão criada no banco de dados.')
    expect(container.textContent).toContain('Supervisor: Renato Resende')
    expect(container.textContent).toContain('2 colaborador(es)')
  })

  it('a diretoria define o cargo de quem está na supervisão e de quem está sem supervisão', async () => {
    teams = [{ id: 't1', name: 'S12 - RENATO', supervisorId: 'renato', supervisorName: 'Renato Resende', coSupervisorIds: [], coSupervisorNames: [], members: [hamilton] }]
    await act(async () => { root.render(<OnlineTeamsPanel service={service} />) })
    expect(container.textContent).toContain('Sem supervisão (1)')
    expect(container.querySelector('select[aria-label="Cargo de Hugo Barbosa"]')).toBeTruthy()
    const select = container.querySelector<HTMLSelectElement>('select[aria-label="Cargo de Hamilton Junior"]')!
    await act(async () => { setValue(select, 'Projetista') })
    expect(service.setJobTitle).toHaveBeenCalledWith('hamilton', 'Projetista')
    expect(container.textContent).toContain('Cargo de Hamilton Junior: Projetista.')
  })

  it('adiciona um segundo supervisor, que sai da lista de colaboradores', async () => {
    await act(async () => { root.render(<OnlineTeamsPanel service={service} />) })
    await act(async () => { button('Nova supervisão').click() })
    await act(async () => { setValue(container.querySelector('input[type="text"]')!, 'Estudos') })
    await act(async () => { setValue(container.querySelector('select')!, 'renato') })
    const hugoMember = () => container.querySelector('input[type="checkbox"]:not([aria-label])') as HTMLInputElement | null
    const memberNames = () => Array.from(container.querySelectorAll('input[type="checkbox"]:not([aria-label])')).map((box) => box.closest('label')?.textContent ?? '')
    expect(memberNames().some((name) => name.includes('Hugo Barbosa'))).toBe(true)
    await act(async () => { (container.querySelector('input[aria-label="Supervisor adicional: Hugo Barbosa"]') as HTMLInputElement).click() })
    expect(memberNames().some((name) => name.includes('Hugo Barbosa'))).toBe(false)
    expect(container.textContent).toContain('Hugo Barbosa passará(ão) a supervisor ao salvar.')
    expect(hugoMember()).toBeTruthy()
    await act(async () => { button('Salvar no banco').click() })
    expect(service.saveTeam).toHaveBeenCalledWith(expect.objectContaining({ name: 'Estudos', supervisorId: 'renato', coSupervisorIds: ['hugo'], memberIds: [] }))
  })

  it('mostra o erro do banco sem fechar o formulário', async () => {
    service.saveTeam = vi.fn(async () => { throw new Error('Somente a diretoria pode gerenciar supervisões.') })
    await act(async () => { root.render(<OnlineTeamsPanel service={service} />) })
    await act(async () => { button('Nova supervisão').click() })
    await act(async () => { setValue(container.querySelector('input[type="text"]')!, 'X') })
    await act(async () => { setValue(container.querySelector('select')!, 'renato') })
    await act(async () => { button('Salvar no banco').click() })
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Somente a diretoria pode gerenciar supervisões.')
    expect(button('Salvar no banco')).toBeTruthy()
  })
})
