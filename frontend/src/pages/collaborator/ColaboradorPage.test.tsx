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

  it('não mistura dados demonstrativos quando a sessão corporativa ainda não possui perfil de aplicação', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/colaborador']}>
        <SessionContext.Provider value={{
          session: { ...collaboratorSession, id: 'auth-profile-1', name: 'Ana Silva', email: 'ana@example.invalid', isDemo: false, authProvider: 'supabase' },
          profile: null,
          corporateProfile: { id: 'auth-profile-1', email: 'ana@example.invalid', full_name: 'Ana Silva', role: 'colaborador', squad_id: 'squad-1', active: true },
          isLoading: false,
          signIn: vi.fn(),
          signOut: vi.fn(),
        }}>
          <ColaboradorPage />
        </SessionContext.Provider>
      </MemoryRouter>,
    )

    expect(markup).toContain('Olá, Ana Silva')
    expect(markup).toContain('Perfil profissional corporativo incompleto')
    expect(markup).not.toContain('Carregando visão geral')
  })
})
