import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { demoCollaborator } from '../../demo/fixtures/demoData'
import { SessionContext } from '../../features/session/sessionContext'
import type { DemoSession } from '../../features/session/types'
import { ColaboradorPage } from './ColaboradorPage'

const collaboratorSession: DemoSession = {
  id: demoCollaborator.id,
  name: demoCollaborator.name,
  role: 'COLLABORATOR',
  createdAt: '2026-07-21T15:30:00.000Z',
  explicitLoginAt: '2026-07-21T15:30:00.000Z',
  isDemo: true,
  version: 2,
}

describe('visão geral do colaborador', () => {
  it('começa pelo conteúdo do dashboard sem repetir os atalhos da navegação', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/colaborador']}>
        <SessionContext.Provider value={{ session: collaboratorSession, profile: demoCollaborator, isLoading: false, signIn: vi.fn(), signOut: vi.fn() }}>
          <ColaboradorPage />
        </SessionContext.Provider>
      </MemoryRouter>,
    )

    expect(markup).not.toContain('Consultar histórico')
    expect(markup).not.toContain('Minhas folgas')
    expect(markup).not.toContain('data-dashboard-shortcuts')
    expect(markup).toContain('Carregando visão geral')
  })
})
