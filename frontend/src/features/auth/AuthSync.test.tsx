// @vitest-environment jsdom
import { StrictMode, act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionContext } from '../session/sessionContext'
import type { DemoSession } from '../session/types'
import { AuthSync } from './AuthSync'
import { provisionMicrosoftProfile } from './authService'

const account = { homeAccountId: 'account-1', username: 'ana@sma.com', name: 'Ana' }
const msal = {
  getActiveAccount: vi.fn(() => account),
  setActiveAccount: vi.fn(),
  acquireTokenSilent: vi.fn(async () => ({ accessToken: 'fresh-token' })),
}

vi.mock('@azure/msal-react', () => ({
  useMsal: () => ({ instance: msal, accounts: [account], inProgress: 'none' }),
  useIsAuthenticated: () => true,
}))
vi.mock('./authService', () => ({ provisionMicrosoftProfile: vi.fn() }))

let root: Root
let container: HTMLDivElement

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  vi.clearAllMocks()
  sessionStorage.clear()
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('AuthSync após loginRedirect', () => {
  it('espera o BFF em Strict Mode e abre o banco escolhido sem novo clique', async () => {
    let finishProvision!: (profile: {
      id: string; email: string; full_name: string; role: 'colaborador'; squad_id: null; active: boolean
    }) => void
    vi.mocked(provisionMicrosoftProfile).mockImplementation(() => new Promise((resolve) => { finishProvision = resolve }))
    const markAuthReady = vi.fn()
    const signInWithMicrosoft = vi.fn()
    sessionStorage.setItem('sma:msal-destination', '/selecao-perfil?modulo=banco2')

    function SessionHarness() {
      const [session, setSession] = useState<DemoSession | null>(null)
      return (
        <SessionContext.Provider value={{
          session, profile: null, isLoading: !session, signIn: vi.fn(), signOut: vi.fn(), markAuthReady,
          signInWithMicrosoft: (input) => {
            signInWithMicrosoft(input)
            const created: DemoSession = {
              ...input, createdAt: '2026-10-13T00:00:00Z', explicitLoginAt: '2026-10-13T00:00:00Z',
              isDemo: false, version: 2, authProvider: 'microsoft',
            }
            setSession(created)
            return created
          },
        }}>
          <MemoryRouter initialEntries={['/']}>
            <AuthSync>
              <Routes>
                <Route path="/" element={<p>Aguardando</p>} />
                <Route path="/selecao-perfil" element={<p>Banco escolhido</p>} />
              </Routes>
            </AuthSync>
          </MemoryRouter>
        </SessionContext.Provider>
      )
    }

    await act(async () => root.render(
      <StrictMode>
        <SessionHarness />
      </StrictMode>,
    ))

    expect(container.textContent).toContain('Validando sessão corporativa')
    expect(markAuthReady).not.toHaveBeenCalled()
    expect(vi.mocked(provisionMicrosoftProfile)).toHaveBeenCalledTimes(1)

    await act(async () => finishProvision({
      id: 'profile-1', email: 'ana@sma.com', full_name: 'Ana', role: 'colaborador', squad_id: null, active: true,
    }))

    expect(signInWithMicrosoft).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('Banco escolhido')
    expect(sessionStorage.getItem('sma:msal-destination')).toBeNull()
    expect(markAuthReady).toHaveBeenCalledTimes(1)
  })

  it('libera a tela pública com erro quando o provisionamento falha', async () => {
    vi.mocked(provisionMicrosoftProfile).mockRejectedValueOnce(new Error('Perfil corporativo indisponível'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    function SessionHarness() {
      const [authError, setAuthError] = useState<string | null>(null)
      return (
        <SessionContext.Provider value={{
          session: null, profile: null, isLoading: !authError, authError,
          signIn: vi.fn(), signOut: vi.fn(), markAuthReady: (error) => setAuthError(error ?? null),
        }}>
          <MemoryRouter>
            <AuthSync><p>Entrada pública: {authError}</p></AuthSync>
          </MemoryRouter>
        </SessionContext.Provider>
      )
    }

    await act(async () => root.render(<SessionHarness />))

    expect(container.textContent).toContain('Entrada pública: Perfil corporativo indisponível')
    consoleError.mockRestore()
  })
})
