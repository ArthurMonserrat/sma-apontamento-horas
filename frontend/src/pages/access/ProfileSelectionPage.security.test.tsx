import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { SessionContext } from '../../features/session/sessionContext'
import { ThemeContext } from '../../app/providers/themeContext'
import { ProfileSelectionPage } from './ProfileSelectionPage'

describe('seleção de perfil após autenticação corporativa', () => {
  it('não oferece o papel Diretor para uma sessão Microsoft', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/selecao-perfil']}>
        <ThemeContext.Provider value={{ theme: 'light', toggleTheme: vi.fn() }}>
          <SessionContext.Provider value={{
            session: null,
            profile: null,
            corporateProfile: {
              id: 'profile-1',
              email: 'ana@example.com',
              full_name: 'Ana Silva',
              role: 'supervisor',
              active: true,
            },
            isLoading: false,
            signIn: vi.fn(),
            signOut: vi.fn(),
          }}>
            <ProfileSelectionPage />
          </SessionContext.Provider>
        </ThemeContext.Provider>
      </MemoryRouter>,
    )

    expect(markup).toContain('A seleção de perfil está disponível apenas no modo demonstrativo')
    expect(markup).not.toContain('Entrar como Direção')
    expect(markup).not.toContain('Entrar como Supervisão')
  })
})
