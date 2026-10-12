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
  const { session } = useContext(SessionContext)!
  return <output data-testid="session">{session?.isDemo ? 'demo' : session ? 'corporate' : 'none'}</output>
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
    expect(container.querySelector('[data-testid="session"]')?.textContent).toBe('demo')

    await act(async () => emit?.('SIGNED_OUT', null))
    await act(async () => emit?.('TOKEN_REFRESHED', null))

    expect(container.querySelector('[data-testid="session"]')?.textContent).toBe('demo')
    expect(authMock.signOut).not.toHaveBeenCalled()
    expect(authMock.getCurrentSession).not.toHaveBeenCalled()
  })
})
