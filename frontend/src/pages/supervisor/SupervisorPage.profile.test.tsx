// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeContext } from '../../app/providers/themeContext'
import { SessionContext } from '../../features/session/sessionContext'
import type { CorporateProfile, DemoSession } from '../../features/session/types'
import { SupervisorPage } from './SupervisorPage'

vi.mock('../../features/auth/infrastructure/supabaseSessionService', () => ({
  getCurrentSession: vi.fn(async () => ({
    user: { id: 'sup-1', app_metadata: { provider: 'azure' }, user_metadata: {}, created_at: '2026-10-20T14:30:00Z', last_sign_in_at: '2026-10-24T18:00:00Z' },
  })),
}))
vi.mock('../../app/providers/tourContext', () => ({ useTour: () => ({ startTour: vi.fn() }) }))

const corporateProfile: CorporateProfile = {
  id: 'sup-1',
  email: 'maria.souza@sma-eng.com.br',
  full_name: 'maria.souza',
  role: 'supervisor',
  active: true,
}

const session: DemoSession = {
  id: 'sup-1',
  name: 'maria.souza',
  email: corporateProfile.email,
  role: 'SUPERVISOR',
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
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

describe('Meu Perfil do supervisor com login Microsoft', () => {
  it('preenche o perfil a partir do e-mail corporativo, sem dados de demonstração', async () => {
    await act(async () => {
      root.render(
        <ThemeContext.Provider value={{ theme: 'light', toggleTheme: vi.fn() }}>
          <SessionContext.Provider value={{ session, corporateProfile, profile: null, isLoading: false, signIn: vi.fn(), signOut: vi.fn(async () => undefined) }}>
            <MemoryRouter initialEntries={['/supervisor?view=perfil']}>
              <SupervisorPage />
            </MemoryRouter>
          </SessionContext.Provider>
        </ThemeContext.Provider>,
      )
    })

    const panel = container.querySelector('[data-testid="corporate-identity-panel"]')
    expect(panel?.textContent).toContain('NomeMaria')
    expect(panel?.textContent).toContain('SobrenomeSouza')
    expect(panel?.textContent).toContain('maria.souza@sma-eng.com.br')
    expect(panel?.textContent).toContain('Supervisor')
    const sidebar = container.querySelector('[aria-label="Perfil atual do supervisor"]')
    expect(sidebar?.textContent).toContain('Maria Souza')
    expect(sidebar?.textContent).toContain('MS')
    expect(container.textContent).not.toContain('Editar Perfil')
  })
})
