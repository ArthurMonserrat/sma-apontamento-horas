// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthCallbackPage, readCallbackCode } from './AuthCallbackPage'

const { navigateMock, exchangeMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  exchangeMock: vi.fn(),
}))

vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }))
vi.mock('../../features/auth/infrastructure/supabaseSessionService', () => ({
  exchangeCallbackCode: exchangeMock,
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
  })

  it('nega callback sem código e não tenta trocar sessão', async () => {
    window.history.replaceState({}, '', '/auth/callback?state=state')

    await act(async () => root.render(<AuthCallbackPage />))

    expect(exchangeMock).not.toHaveBeenCalled()
    expect(navigateMock).toHaveBeenCalledWith('/?authError=invalid_callback', { replace: true })
  })

  it('troca callback válido e retorna ao ecossistema', async () => {
    await act(async () => root.render(<AuthCallbackPage />))

    expect(exchangeMock).toHaveBeenCalledWith('oauth-code')
    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true })
  })
})
