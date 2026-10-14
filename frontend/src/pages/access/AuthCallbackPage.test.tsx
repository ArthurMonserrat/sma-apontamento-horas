// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthCallbackPage } from './AuthCallbackPage'
import { readCallbackCode } from './authCallback'

const { navigateMock, exchangeMock, clearUrlMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  exchangeMock: vi.fn(),
  clearUrlMock: vi.fn(),
}))

vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }))
vi.mock('../../features/auth/infrastructure/supabaseSessionService', () => ({
  exchangeCallbackCode: exchangeMock,
  clearAuthCallbackUrl: clearUrlMock,
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  vi.clearAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  window.history.replaceState({}, '', '/auth/callback?code=oauth-code&state=state')
  exchangeMock.mockResolvedValue({ error: null })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('AuthCallbackPage', () => {
  it('extrai código válido da URL', () => {
    expect(readCallbackCode('?code=oauth-code&state=state')).toBe('oauth-code')
    expect(readCallbackCode('', '#/auth/callback?code=hash-code&state=state')).toBe('hash-code')
  })

  it('nega callback sem código e não tenta trocar sessão', async () => {
    window.history.replaceState({}, '', '/auth/callback?state=state')

    await act(async () => root.render(<AuthCallbackPage />))

    expect(exchangeMock).not.toHaveBeenCalled()
    expect(clearUrlMock).toHaveBeenCalledTimes(1)
    expect(navigateMock).toHaveBeenCalledWith('/?authError=invalid_callback', { replace: true })
  })

  it('troca callback válido e retorna ao ecossistema', async () => {
    await act(async () => root.render(<AuthCallbackPage />))

    expect(exchangeMock).toHaveBeenCalledWith('oauth-code')
    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true })
  })

  it('ignora destino externo ou desconhecido salvo antes do callback', async () => {
    sessionStorage.setItem('sma:oauth-destination', 'https://banco2.example.com')

    await act(async () => root.render(<AuthCallbackPage />))

    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true })
    expect(sessionStorage.getItem('sma:oauth-destination')).toBeNull()
  })
})
