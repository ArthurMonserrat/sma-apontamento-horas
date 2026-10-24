// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeContext } from '../../app/providers/themeContext'
import { SessionContext } from '../../features/session/sessionContext'
import type { CorporateProfile, DemoSession } from '../../features/session/types'
import { getCurrentSession } from '../../features/auth/infrastructure/supabaseSessionService'
import { DiretorPerfilPage } from './DiretorPerfilPage'

vi.mock('../../features/auth/infrastructure/supabaseSessionService', () => ({ getCurrentSession: vi.fn() }))

const corporateProfile: CorporateProfile = {
  id: 'auth-user-1',
  email: 'fernando.almeida@sma-eng.com.br',
  full_name: 'Fernando Almeida',
  role: 'diretor',
  active: true,
}

const session: DemoSession = {
  id: 'auth-user-1',
  name: 'Fernando Almeida',
  email: corporateProfile.email,
  role: 'DIRECTOR_ADMIN',
  createdAt: '2026-10-24T00:00:00Z',
  explicitLoginAt: '2026-10-24T00:00:00Z',
  isDemo: false,
  version: 2,
  authProvider: 'supabase',
  corporateProfile,
}

let root: Root
let container: HTMLDivElement

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  vi.mocked(getCurrentSession).mockResolvedValue({
    user: {
      id: 'auth-user-1',
      app_metadata: { provider: 'azure' },
      user_metadata: { full_name: 'Fernando Almeida' },
      created_at: '2026-10-20T14:30:00Z',
      last_sign_in_at: '2026-10-24T18:00:00Z',
    },
  } as never)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.clearAllMocks()
})

async function renderPage(value: { session: DemoSession | null; corporateProfile: CorporateProfile | null }) {
  await act(async () => {
    root.render(
      <ThemeContext.Provider value={{ theme: 'light', toggleTheme: vi.fn() }}>
        <SessionContext.Provider value={{ ...value, profile: null, isLoading: false, signIn: vi.fn(), signOut: vi.fn(async () => undefined) }}>
          <MemoryRouter initialEntries={['/administracao/perfil']}>
            <DiretorPerfilPage />
          </MemoryRouter>
        </SessionContext.Provider>
      </ThemeContext.Provider>,
    )
  })
}

describe('Meu perfil da diretoria', () => {
  it('preenche nome, sobrenome, e-mail e acesso a partir do login Microsoft', async () => {
    await renderPage({ session, corporateProfile })

    const text = container.textContent ?? ''
    expect(text).toContain('Meu perfil')
    expect(text).toContain('NomeFernando')
    expect(text).toContain('SobrenomeAlmeida')
    expect(text).toContain('fernando.almeida@sma-eng.com.br')
    expect(text).toContain('Diretoria')
    expect(text).toContain('Microsoft (conta corporativa SM&A)')
    expect(text).toContain('Último acesso24/10/2026, 15:00')
    expect(container.querySelector('[aria-current="page"]')?.textContent).toContain('Meu perfil')
  })

  it('não usa dados de demonstração quando não há perfil corporativo', async () => {
    await renderPage({ session: null, corporateProfile: null })

    expect(container.textContent).toContain('Não foi possível carregar o perfil corporativo')
  })
})
