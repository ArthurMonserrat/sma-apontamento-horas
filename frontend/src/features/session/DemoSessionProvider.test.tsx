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
    mapCorporateRole: vi.fn((role: unknown) => ({
      colaborador: 'COLLABORATOR', supervisor: 'SUPERVISOR', diretor: 'DIRECTOR_ADMIN',
    } as Record<string, string>)[String(role)] ?? null),
  },
}))

vi.mock('./infrastructure/demoSessionService', () => ({ demoSessionService: demoServiceMock }))
vi.mock('../profile/infrastructure/profileService', () => ({
  PROFILE_UPDATED_EVENT: 'profile-updated',
  profileService: profileServiceMock,
}))
vi.mock('../auth/authService', () => corporateAuthMock)
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

function DemoLoginButton() {
  const { signIn } = useContext(SessionContext)!
  return <button type="button" onClick={() => signIn('COLLABORATOR')}>demo</button>
}

function SignOutButton() {
  const { signOut } = useContext(SessionContext)!
  return <button type="button" onClick={() => void signOut()}>sair</button>
}

function createSupabaseSession(id: string, token = `token-${id}`) {
  return { access_token: token, user: { id, email: `${id}@example.com` } }
}

function createProfile(id: string, role = 'colaborador', active = true) {
  return {
    id,
    email: `${id}@example.com`,
    full_name: `Nome ${id}`,
    role,
    squad_id: null,
    active,
  }
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
  corporateAuthMock.getCorporateProfile.mockResolvedValue(createProfile('user-1'))
  corporateAuthMock.mapCorporateRole.mockImplementation((role: unknown) => ({
    colaborador: 'COLLABORATOR', supervisor: 'SUPERVISOR', diretor: 'DIRECTOR_ADMIN',
  } as Record<string, string>)[String(role)] ?? null)
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

  it('preserva um login demo ocorrido enquanto a restauração Supabase ainda está pendente', async () => {
    demoServiceMock.restore.mockReturnValue(null)
    demoServiceMock.signIn.mockReturnValue({
      id: 'demo-user', name: 'Demo', role: 'COLLABORATOR',
      createdAt: '2026-01-01T00:00:00.000Z', explicitLoginAt: '2026-01-01T00:00:00.000Z',
      isDemo: true, version: 2, authProvider: 'demo',
    })
    let resolveSession: ((session: null) => void) | undefined
    authMock.getCurrentSession.mockReturnValueOnce(new Promise((resolve) => { resolveSession = resolve }))

    await act(async () => root.render(<DemoSessionProvider><DemoLoginButton /><Consumer /></DemoSessionProvider>))
    await act(async () => container.querySelector('button')?.click())
    await act(async () => resolveSession?.(null))

    expect(container.querySelector('[data-testid="session"]')?.textContent).toBe('demo|authorized|')
  })

  it('restaura a sessão Supabase somente após validar e carregar o perfil corporativo', async () => {
    demoServiceMock.restore.mockReturnValue(null)
    authMock.getCurrentSession.mockResolvedValue(createSupabaseSession('user-1'))

    await act(async () => root.render(<DemoSessionProvider><Consumer /></DemoSessionProvider>))

    expect(container.querySelector('[data-testid="session"]')?.textContent).toBe('corporate|authorized|')
    expect(corporateAuthMock.getCorporateProfile).toHaveBeenCalledWith('token-user-1')
    expect(profileServiceMock.getById).not.toHaveBeenCalled()
  })

  it('deduplica INITIAL_SESSION e restauração concorrente para o mesmo usuário/token', async () => {
    demoServiceMock.restore.mockReturnValue(null)
    const session = createSupabaseSession('user-1')
    let emit: ((event: 'INITIAL_SESSION', session: ReturnType<typeof createSupabaseSession> | null) => void) | undefined
    authMock.subscribe.mockImplementation((listener: typeof emit) => {
      emit = listener
      return { unsubscribe: vi.fn() }
    })
    authMock.getCurrentSession.mockResolvedValue(session)

    await act(async () => {
      root.render(<DemoSessionProvider><Consumer /></DemoSessionProvider>)
      emit?.('INITIAL_SESSION', session)
    })

    expect(corporateAuthMock.getCorporateProfile).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[data-testid="session"]')?.textContent).toBe('corporate|authorized|')
  })

  it('ignora uma resposta de perfil atrasada de uma sessão anterior', async () => {
    demoServiceMock.restore.mockReturnValue(null)
    let emit: ((event: 'SIGNED_IN', session: ReturnType<typeof createSupabaseSession>) => void) | undefined
    authMock.subscribe.mockImplementation((listener: typeof emit) => {
      emit = listener
      return { unsubscribe: vi.fn() }
    })
    authMock.getCurrentSession.mockResolvedValue(null)
    let resolveOld: ((profile: ReturnType<typeof createProfile>) => void) | undefined
    corporateAuthMock.getCorporateProfile
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
      .mockResolvedValueOnce(createProfile('user-2', 'supervisor'))

    await act(async () => root.render(<DemoSessionProvider><Consumer /></DemoSessionProvider>))
    await act(async () => emit?.('SIGNED_IN', createSupabaseSession('user-1')))
    await act(async () => emit?.('SIGNED_IN', createSupabaseSession('user-2')))
    await act(async () => resolveOld?.(createProfile('user-1')))

    expect(container.querySelector('[data-testid="session"]')?.textContent).toBe('corporate|authorized|')
    expect(corporateAuthMock.getCorporateProfile).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['ausente', null, null],
    ['inativo', createProfile('user-1', 'colaborador', false), null],
    ['cargo desconhecido', createProfile('user-1', 'owner'), null],
  ])('mantém perfil %s não autorizado e exibe erro recuperável', async (_label, profile, mappedRole) => {
    demoServiceMock.restore.mockReturnValue(null)
    authMock.getCurrentSession.mockResolvedValue(createSupabaseSession('user-1'))
    corporateAuthMock.getCorporateProfile.mockResolvedValue(profile)
    corporateAuthMock.mapCorporateRole.mockReturnValue(mappedRole as never)

    await act(async () => root.render(<DemoSessionProvider><Consumer /></DemoSessionProvider>))

    expect(container.querySelector('[data-testid="session"]')?.textContent).toContain('none|authenticated_unauthorized|')
    expect(container.querySelector('[data-testid="session"]')?.textContent).toContain('perfil corporativo')
  })

  it('mantém sessão não autorizada quando a consulta do perfil falha', async () => {
    demoServiceMock.restore.mockReturnValue(null)
    let emit: ((event: 'SIGNED_IN' | 'TOKEN_REFRESHED', session: ReturnType<typeof createSupabaseSession>) => void) | undefined
    authMock.subscribe.mockImplementation((listener: typeof emit) => {
      emit = listener
      return { unsubscribe: vi.fn() }
    })
    authMock.getCurrentSession.mockResolvedValue(null)
    corporateAuthMock.getCorporateProfile.mockRejectedValue(new Error('API indisponível'))

    await act(async () => root.render(<DemoSessionProvider><Consumer /></DemoSessionProvider>))
    await act(async () => emit?.('SIGNED_IN', createSupabaseSession('user-1')))
    await act(async () => emit?.('TOKEN_REFRESHED', createSupabaseSession('user-1', 'refreshed-token-user-1')))

    expect(container.querySelector('[data-testid="session"]')?.textContent).toBe('none|authenticated_unauthorized|Não foi possível validar um perfil corporativo ativo. Contate a Administração.')
    expect(corporateAuthMock.getCorporateProfile).toHaveBeenCalledTimes(1)
  })

  it('limpa sessão corporativa ao receber logout Supabase', async () => {
    demoServiceMock.restore.mockReturnValue(null)
    authMock.getCurrentSession.mockResolvedValue(createSupabaseSession('user-1'))
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
