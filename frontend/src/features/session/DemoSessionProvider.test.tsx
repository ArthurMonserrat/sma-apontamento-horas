// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DemoSessionProvider } from './DemoSessionProvider'
import { SessionContext } from './sessionContext'
import { useContext } from 'react'

const { demoServiceMock, profileServiceMock, authMock } = vi.hoisted(() => ({
  demoServiceMock: {
    restore: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
  },
  profileServiceMock: { getById: vi.fn() },
  authMock: {
    getCurrentSession: vi.fn(),
    signOut: vi.fn(),
    subscribe: vi.fn(),
  },
}))

vi.mock('./infrastructure/demoSessionService', () => ({ demoSessionService: demoServiceMock }))
vi.mock('../profile/infrastructure/profileService', () => ({
  PROFILE_UPDATED_EVENT: 'profile-updated',
  profileService: profileServiceMock,
}))
vi.mock('../auth/authService', () => ({
  getCorporateProfile: vi.fn(),
  mapCorporateRole: vi.fn(),
}))
vi.mock('../auth/infrastructure/supabaseSessionService', () => ({
  getCurrentSession: authMock.getCurrentSession,
  signOut: authMock.signOut,
  subscribe: authMock.subscribe,
}))

function Consumer() {
  const { session, authState, authError } = useContext(SessionContext)!
  return <output data-testid="session">{session?.isDemo ? 'demo' : session ? 'corporate' : 'none'}|{authState}|{authError ?? ''}</output>
}

function AuthenticationStarter() {
  const { beginAuthentication } = useContext(SessionContext)!
  return <button type="button" onClick={() => beginAuthentication?.()}>iniciar</button>
}

let root: Root
let container: HTMLDivElement

beforeEach(() => {
  vi.clearAllMocks()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  demoServiceMock.restore.mockReturnValue({
    id: 'demo-user',
    name: 'Demo',
    email: 'demo@example.com',
    role: 'COLLABORATOR',
    createdAt: '2026-01-01T00:00:00.000Z',
    explicitLoginAt: '2026-01-01T00:00:00.000Z',
    isDemo: true,
    version: 2,
    authProvider: 'demo',
  })
  authMock.getCurrentSession.mockResolvedValue(null)
  authMock.signOut.mockResolvedValue({ error: null })
  authMock.subscribe.mockReturnValue({ unsubscribe: vi.fn() })
  profileServiceMock.getById.mockResolvedValue(null)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('DemoSessionProvider', () => {
  it('mantém a demonstração isolada de eventos Supabase corporativos', async () => {
    let emit: ((event: 'SIGNED_OUT' | 'SIGNED_IN' | 'TOKEN_REFRESHED', session: null) => void) | undefined
    authMock.subscribe.mockImplementation((listener: (event: 'SIGNED_OUT' | 'SIGNED_IN' | 'TOKEN_REFRESHED', session: null) => void) => {
      emit = listener
      return { unsubscribe: vi.fn() }
    })

    await act(async () => root.render(<DemoSessionProvider><Consumer /></DemoSessionProvider>))
    expect(container.querySelector('[data-testid="session"]')?.textContent).toBe('demo|authorized|')

    await act(async () => emit?.('SIGNED_OUT', null))
    await act(async () => emit?.('TOKEN_REFRESHED', null))

    expect(container.querySelector('[data-testid="session"]')?.textContent).toBe('demo|authorized|')
    expect(authMock.signOut).not.toHaveBeenCalled()
    expect(authMock.getCurrentSession).not.toHaveBeenCalled()
  })

  it('encerra a inicialização sem sessão Supabase', async () => {
    demoServiceMock.restore.mockReturnValue(null)

    await act(async () => root.render(<DemoSessionProvider><Consumer /></DemoSessionProvider>))

    expect(container.querySelector('[data-testid="session"]')?.textContent).toBe('none|unauthenticated|')
    expect(authMock.getCurrentSession).toHaveBeenCalledTimes(1)
  })

  it('marca sessão Supabase sem perfil como autenticada porém não autorizada', async () => {
    demoServiceMock.restore.mockReturnValue(null)
    authMock.getCurrentSession.mockResolvedValue({ data: { session: { access_token: 'token', user: { id: 'user-1' } } }, error: null })

    await act(async () => root.render(<DemoSessionProvider><Consumer /></DemoSessionProvider>))

    expect(container.querySelector('[data-testid="session"]')?.textContent).toBe('none|authenticated_unauthorized|A sessão corporativa ainda não foi autorizada.')
  })

  it('limpa sessão corporativa ao receber logout Supabase', async () => {
    demoServiceMock.restore.mockReturnValue(null)
    authMock.getCurrentSession.mockResolvedValue({ data: { session: { access_token: 'token', user: { id: 'user-1' } } }, error: null })
    let emit: ((event: 'SIGNED_OUT', session: null) => void) | undefined
    authMock.subscribe.mockImplementation((listener: (event: 'SIGNED_OUT', session: null) => void) => {
      emit = listener
      return { unsubscribe: vi.fn() }
    })

    await act(async () => root.render(<DemoSessionProvider><Consumer /></DemoSessionProvider>))
    await act(async () => emit?.('SIGNED_OUT', null))

    expect(container.querySelector('[data-testid="session"]')?.textContent).toBe('none|unauthenticated|')
  })

  it('expõe estado autenticando sem liberar nenhuma rota', async () => {
    demoServiceMock.restore.mockReturnValue(null)

    await act(async () => root.render(<DemoSessionProvider><AuthenticationStarter /><Consumer /></DemoSessionProvider>))
    await act(async () => container.querySelector('button')?.click())

    expect(container.querySelector('[data-testid="session"]')?.textContent).toBe('none|authenticating|')
  })

  it('encerra em erro quando a restauração da sessão falha', async () => {
    demoServiceMock.restore.mockReturnValue(null)
    authMock.getCurrentSession.mockRejectedValueOnce(new Error('network'))

    await act(async () => root.render(<DemoSessionProvider><Consumer /></DemoSessionProvider>))

    expect(container.querySelector('[data-testid="session"]')?.textContent).toBe('none|error|Não foi possível restaurar a sessão corporativa. Tente novamente.')
  })
})
