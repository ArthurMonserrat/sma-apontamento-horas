// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HoursReportsPanel } from './HoursReportsPanel'
import type { HoursReportService } from './hoursReportService'
import type { HoursReportRow } from './types'

const row = (overrides: Partial<HoursReportRow>): HoursReportRow => ({
  collaboratorId: 'sabrina', collaboratorName: 'Sabrina Drumond', jobTitle: null, teamId: 't1', teamName: 'Estudos',
  projectId: 'p1', projectCode: '25A163E', projectDescription: 'Santa Rita', projectClient: 'APPIAN',
  projectActivityId: 'a1', projectActivityName: 'Fluxo de Potência', projectActivityComplement: null,
  entryProjectCode: '25A163E', entryClient: 'APPIAN', activityId: 'x', status: 'APPROVED', minutes: 480, entries: 1, days: 1, ...overrides,
})

let root: Root
let container: HTMLDivElement
const flush = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) }) }
const button = (label: string) => Array.from(container.querySelectorAll('button')).find((item) => item.textContent === label)!

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => { act(() => root.unmount()); container.remove() })

describe('HoursReportsPanel', () => {
  it('mostra horas por projeto e abre as atividades', async () => {
    const service = { load: vi.fn(async () => [row({}), row({ collaboratorId: 'alan', collaboratorName: 'Alan', projectActivityId: 'a2', projectActivityName: 'Curto-circuito', minutes: 120, status: 'PENDING' })]) } as unknown as HoursReportService
    const exporter = vi.fn(async () => undefined)
    act(() => root.render(<HoursReportsPanel scope="equipe" service={service} exporter={exporter} />))
    await flush()
    expect(service.load).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('Somente a sua equipe')
    expect(container.textContent).toContain('25A163E — Santa Rita')
    expect(container.textContent).toContain('10h')
    // supervisor com uma equipe: sem aba Supervisões
    expect(container.textContent).not.toContain('Supervisões')
    act(() => button('Ver atividades').click())
    expect(container.querySelector('[aria-label="Atividades do projeto 25A163E"]')?.textContent).toContain('Fluxo de Potência8h80%Sabrina Drumond (8h)')
    await act(async () => button('Exportar Excel').click())
    const [sheets, period, scope] = exporter.mock.calls[0] as unknown as [Array<{ name: string; rows: unknown[][] }>, unknown, string]
    expect(sheets.map((sheet) => sheet.name)).toEqual(['Projetos', 'Atividades por projeto', 'Colaboradores', 'Atividades gerais'])
    expect(sheets[1].rows).toEqual([['25A163E', 'Fluxo de Potência', 'Sabrina Drumond', 8, 80], ['25A163E', 'Curto-circuito', 'Alan', 2, 20]])
    expect(period).toMatchObject({ startDate: expect.any(String) })
    expect(scope).toBe('Equipe')
  })

  it('diretoria vê supervisões e colaboradores', async () => {
    const service = { load: vi.fn(async () => [row({}), row({ collaboratorId: 'hugo', collaboratorName: 'Hugo', teamName: 'S12 - RENATO', projectId: null, projectCode: null, entryProjectCode: 'X1', minutes: 60 })]) } as unknown as HoursReportService
    act(() => root.render(<HoursReportsPanel scope="diretoria" service={service} />))
    await flush()
    act(() => button('Supervisões').click())
    expect(container.textContent).toContain('S12 - RENATO')
    act(() => button('Colaboradores').click())
    expect(container.textContent).toContain('Hugo')
    act(() => button('Projetos').click())
    expect(container.textContent).toContain('não cadastrado')
  })

  it('mostra erro do banco', async () => {
    const service = { load: vi.fn(async () => { throw new Error('Somente supervisão e diretoria veem os relatórios.') }) } as unknown as HoursReportService
    act(() => root.render(<HoursReportsPanel scope="equipe" service={service} />))
    await flush()
    expect(container.textContent).toContain('Somente supervisão e diretoria')
  })
})
