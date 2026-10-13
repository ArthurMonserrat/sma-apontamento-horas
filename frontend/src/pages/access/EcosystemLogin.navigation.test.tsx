// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeContext } from '../../app/providers/themeContext'
import { SessionContext } from '../../features/session/sessionContext'
import type { DemoSession } from '../../features/session/types'
import { EcosystemLogin } from './EcosystemLogin'

const msal = {
  getActiveAccount: vi.fn<() => { homeAccountId: string; username: string; name: string } | null>(() => null),
  loginRedirect: vi.fn(async () => undefined),
}

vi.mock('@azure/msal-react', () => ({
  useMsal: () => ({ instance: msal, accounts: [], inProgress: 'none' }),
}))

let root: Root
let container: HTMLDivElement

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  sessionStorage.clear()
  vi.clearAllMocks()
  msal.getActiveAccount.mockReturnValue(null)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function renderLogin(session: DemoSession | null) {
  return root.render(
    <ThemeContext.Provider value={{ theme: 'light', toggleTheme: vi.fn() }}>
      <SessionContext.Provider value={{ session, profile: null, isLoading: false, signIn: vi.fn(), signOut: vi.fn() }}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<EcosystemLogin />} />
            <Route path="/selecao-perfil" element={<p>Banco selecionado</p>} />
          </Routes>
        </MemoryRouter>
      </SessionContext.Provider>
    </ThemeContext.Provider>,
  )
}

describe('acesso ao ecossistema', () => {
  it('guarda o Banco 1 antes de iniciar o login Microsoft', async () => {
    await act(async () => renderLogin(null))
    const button = [...container.querySelectorAll('button')].find((item) => item.textContent === 'Acessar Banco 1')

    await act(async () => button?.click())

    expect(sessionStorage.getItem('sma:msal-destination')).toBe('/selecao-perfil?modulo=banco1')
    expect(msal.loginRedirect).toHaveBeenCalledTimes(1)
  })

  it('abre diretamente o Banco 2 quando a sessão corporativa já está válida', async () => {
    msal.getActiveAccount.mockReturnValue({ homeAccountId: 'account-1', username: 'ana@sma.com', name: 'Ana' })
    const session: DemoSession = {
      id: 'account-1', name: 'Ana', email: 'ana@sma.com', role: 'COLLABORATOR',
      createdAt: '2026-10-13T00:00:00Z', explicitLoginAt: '2026-10-13T00:00:00Z',
      isDemo: false, version: 2, authProvider: 'microsoft',
    }
    await act(async () => renderLogin(session))
    const button = [...container.querySelectorAll('button')].find((item) => item.textContent === 'Acessar Banco 2')

    await act(async () => button?.click())

    expect(container.textContent).toContain('Banco selecionado')
    expect(msal.loginRedirect).not.toHaveBeenCalled()
  })
})
