// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { authMock, clientMock } = vi.hoisted(() => {
  const auth = {
    signInWithOAuth: vi.fn(),
    exchangeCodeForSession: vi.fn(),
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signOut: vi.fn(),
  }
  return { authMock: auth, clientMock: { auth } }
})

vi.mock('./supabaseAuthClient', () => ({ supabaseAuthClient: clientMock }))
vi.mock('../../../config/supabaseConfig', () => ({
  getSupabaseBrowserConfig: () => ({
    url: 'https://project.supabase.co',
    anonKey: 'anon-key',
    redirectTo: 'https://app.example/#/auth/callback',
    enabled: true,
  }),
}))

import {
  exchangeCallbackCode,
  getCurrentSession,
  resetCallbackExchangeState,
  signOut,
  startCorporateOAuth,
} from './supabaseSessionService'

beforeEach(() => {
  vi.clearAllMocks()
  resetCallbackExchangeState()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  window.history.replaceState({}, '', '/auth/callback?code=oauth-code&state=state-value')
  authMock.signInWithOAuth.mockResolvedValue({ error: null })
  authMock.exchangeCodeForSession.mockResolvedValue({ error: null })
  authMock.getSession.mockResolvedValue({ data: { session: null }, error: null })
  authMock.signOut.mockResolvedValue({ error: null })
})

describe('supabaseSessionService', () => {
  it('inicia OAuth Azure com PKCE, redirect permitido e escopos mínimos', async () => {
    await expect(startCorporateOAuth()).resolves.toEqual({ error: null })

    expect(authMock.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'azure',
      options: {
        redirectTo: 'https://app.example/#/auth/callback',
        scopes: 'openid profile email',
      },
    })
  })

  it('troca o mesmo código somente uma vez e remove parâmetros sensíveis da URL', async () => {
    await expect(exchangeCallbackCode('oauth-code')).resolves.toEqual({ error: null })
    await expect(exchangeCallbackCode('oauth-code')).resolves.toEqual({ error: null })

    expect(authMock.exchangeCodeForSession).toHaveBeenCalledTimes(1)
    expect(window.location.search).toBe('')
  })

  it('reutiliza resultado quando StrictMode dispara duas trocas concorrentes', async () => {
    let resolveExchange: ((value: { error: null }) => void) | undefined
    authMock.exchangeCodeForSession.mockReturnValueOnce(new Promise((resolve) => { resolveExchange = resolve }))

    const first = exchangeCallbackCode('concurrent-code')
    const second = exchangeCallbackCode('concurrent-code')
    resolveExchange?.({ error: null })

    await expect(first).resolves.toEqual({ error: null })
    await expect(second).resolves.toEqual({ error: null })
    expect(authMock.exchangeCodeForSession).toHaveBeenCalledTimes(1)
  })

  it('propaga falha de troca sem tentar um segundo exchange', async () => {
    authMock.exchangeCodeForSession.mockResolvedValueOnce({ error: new Error('expired code') })

    await expect(exchangeCallbackCode('expired-code')).resolves.toEqual({ error: expect.any(Error) })
    await expect(exchangeCallbackCode('expired-code')).resolves.toEqual({ error: expect.any(Error) })
    expect(authMock.exchangeCodeForSession).toHaveBeenCalledTimes(1)
  })

  it('consulta sessão e executa logout pela autoridade Supabase', async () => {
    const session = { access_token: 'token', user: { id: 'user-1' } }
    authMock.getSession.mockResolvedValue({ data: { session }, error: null })

    await expect(getCurrentSession()).resolves.toEqual(session)
    await expect(signOut()).resolves.toEqual({ error: null })
    expect(authMock.signOut).toHaveBeenCalledTimes(1)
  })
})
