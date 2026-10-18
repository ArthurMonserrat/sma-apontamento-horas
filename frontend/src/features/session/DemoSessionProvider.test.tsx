// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DemoSessionProvider } from './DemoSessionProvider'
import { SessionContext } from './sessionContext'
import { useContext } from 'react'

const { demoServiceMock, profileServiceMock, authMock, corporateAuthMock } = vi.hoisted(() => ({
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
  corporateAuthMock: {
    getCorporateProfile: vi.fn(),
    mapCorporateRole: vi.fn(),
  },
}))

vi.mock('./infrastructure/demoSessionService', () => ({ demoSessionService: demoServiceMock }))
vi.mock('../profile/infrastructure/profileService', () => ({
  PROFILE_UPDATED_EVENT: 'profile-updated',
  profileService: profileServiceMock,
}))
vi.mock('../auth/authService', () => ({
  getCorporateProfile: corporateAuthMock.getCorporateProfile,
  mapCorporateRole: corporateAuthMock.mapCorporateRole,
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

function LoadingState() {
  const { isLoading } = useContext(SessionContext)!
  return <output data-testid="loading">{isLoading ? 'loading' : 'ready'}</output>
}

function AuthenticationStarter() {
  const { beginAuthentication } = useContext(SessionContext)!
  return <button type="button" onClick={() => beginAuthentication?.()}>iniciar</button>
}

function SignOutButton() {
  const { signOut } = useContext(SessionContext)!
  return <button type="button" onClick={() => void signOut()}>sair</button>
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
  corporateAuthMock.getCorporateProfile.mockResolvedValue(null)
  corporateAuthMock.mapCorporateRole.mockImplementation((role: string) => role === 'colaborador' ? 'COLLABORATOR' : null)
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

  it('publica uma sessão corporativa somente quando o servidor retorna perfil autorizado', async () => {
    demoServiceMock.restore.mockReturnValue(null)
    const corporateProfile = {
      id: 'profile-1',
      email: 'collab@example.invalid',
      full_name: 'Collaborator One',
      role: 'colaborador',
      squad_id: 'squad-1',
      active: true,
    } as const
    corporateAuthMock.getCorporateProfile.mockResolvedValue(corporateProfile)
    corporateAuthMock.mapCorporateRole.mockReturnValue('COLLABORATOR')
    authMock.getCurrentSession.mockResolvedValue({ access_token: 'token', user: { id: 'auth-user-1', email: corporateProfile.email } })

    await act(async () => root.render(<DemoSessionProvider><Consumer /></DemoSessionProvider>))

    expect(corporateAuthMock.getCorporateProfile).toHaveBeenCalledWith('token')
    expect(container.querySelector('[data-testid="session"]')?.textContent).toBe('corporate|authorized|')
  })

  it('mantém o acesso bloqueado quando o servidor recusa o perfil', async () => {
    demoServiceMock.restore.mockReturnValue(null)
    corporateAuthMock.getCorporateProfile.mockRejectedValue(new Error('authorization_pending'))
    authMock.getCurrentSession.mockResolvedValue({ access_token: 'token', user: { id: 'auth-user-1' } })

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

  it('aguarda a confirmação do provedor e deduplica logout repetido', async () => {
    let resolveSignOut: ((value: { error: null }) => void) | undefined
    authMock.signOut.mockReturnValueOnce(new Promise((resolve) => { resolveSignOut = resolve }))

    await act(async () => root.render(<DemoSessionProvider><SignOutButton /><Consumer /><LoadingState /></DemoSessionProvider>))
    await act(async () => container.querySelector('button')?.click())
    await act(async () => container.querySelector('button')?.click())

    expect(authMock.signOut).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[data-testid="session"]')?.textContent).toBe('none|signing_out|')
    expect(container.querySelector('[data-testid="loading"]')?.textContent).toBe('ready')

    await act(async () => resolveSignOut?.({ error: null }))

    expect(container.querySelector('[data-testid="session"]')?.textContent).toBe('none|unauthenticated|')
  })

  it('mantém o acesso bloqueado e informa incerteza quando o logout falha', async () => {
    authMock.signOut.mockResolvedValueOnce({ error: new Error('network') })

    await act(async () => root.render(<DemoSessionProvider><SignOutButton /><Consumer /></DemoSessionProvider>))
    await act(async () => container.querySelector('button')?.click())

    expect(container.querySelector('[data-testid="session"]')?.textContent).toBe('none|error|Não foi possível confirmar o encerramento da sessão. Tente novamente.')
  })
})
