// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionContext } from '../../features/session/sessionContext'
import type { DemoSession } from '../../features/session/types'

vi.mock('../../features/corporate/corporateData', async (importOriginal) => ({ ...await importOriginal<object>(), isCorporateDataActive: () => true }))
vi.mock('../../features/time-entries/infrastructure/visibleTimeEntries', () => ({
  listVisibleTimeEntries: async () => [{
    id: 'e1', collaboratorId: 'hugo', collaboratorName: 'Hugo Barbosa', entryDate: new Date().toISOString().slice(0, 10), projectCode: 'P', durationMinutes: 480, status: 'PENDING',
    assignmentSnapshot: { squadId: 'old', squadName: 'Antiga', supervisorId: 'x', supervisorName: 'Supervisor antigo' },
  }],
}))
const person = (id: string, name: string) => ({ id, name, email: `${id}@x`, role: 'colaborador' as const, teamId: null, teamName: null, supervisorId: null, supervisorName: null, jobTitle: null })
vi.mock('../../features/teams/infrastructure/onlineTeamService', () => ({
  onlineTeamService: {
    listTeams: async () => [
      { id: 't1', name: 'S12', supervisorId: 'renato', supervisorName: 'Renato Assis de Resende', coSupervisorIds: [], coSupervisorNames: [], members: [person('hugo', 'Hugo Barbosa')] },
      { id: 't2', name: 'Estudos', supervisorId: 'henrique', supervisorName: 'Henrique Calenzani', coSupervisorIds: ['bruna'], coSupervisorNames: ['Bruna Alvarenga'], members: [person('giuliano', 'Giuliano Carnevali'), person('sabrina', 'Sabrina Drumond')] },
    ],
  },
}))

vi.mock('../../app/layouts/ThemeToggle', () => ({ ThemeToggle: () => null }))

import { RelatoriosPage } from './RelatoriosPage'

let root: Root
let container: HTMLDivElement
const director: DemoSession = { id: 'diretor', name: 'Fernando Almeida', role: 'DIRECTOR_ADMIN', createdAt: '', explicitLoginAt: '', isDemo: false, version: 2, authProvider: 'supabase' }

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('Relatórios com supervisões do banco de dados', () => {
  it('mostra todas as supervisões (também sem apontamentos) e agrupa pela supervisão atual', async () => {
    await act(async () => {
      root.render(<SessionContext.Provider value={{ session: director, profile: null, isLoading: false, signIn: vi.fn(), signOut: vi.fn() }}>
        <MemoryRouter><RelatoriosPage /></MemoryRouter>
      </SessionContext.Provider>)
    })
    await act(async () => { await Promise.resolve() })
    const text = container.textContent ?? ''
    expect(text).toContain('Renato Assis de Resende')
    expect(text).toContain('Henrique Calenzani, Bruna Alvarenga')
    expect(text).not.toContain('Supervisor antigo')
  })
})
