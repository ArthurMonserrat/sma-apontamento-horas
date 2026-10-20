// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeContext } from '../../app/providers/themeContext'
import { SessionContext } from '../../features/session/sessionContext'
import { startCorporateOAuth } from '../../features/auth/infrastructure/supabaseSessionService'
import { EcosystemLogin } from './EcosystemLogin'

vi.mock('../../features/auth/infrastructure/supabaseSessionService', () => ({ startCorporateOAuth: vi.fn() }))

let root: Root
let container: HTMLDivElement

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  sessionStorage.clear()
  vi.clearAllMocks()
  vi.mocked(startCorporateOAuth).mockResolvedValue({ error: null })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function renderLogin(path = '/') {
  return root.render(
    <ThemeContext.Provider value={{ theme: 'light', toggleTheme: vi.fn() }}>
      <SessionContext.Provider value={{ session: null, profile: null, isLoading: false, signIn: vi.fn(), signOut: vi.fn() }}>
        <MemoryRouter initialEntries={[path]}>
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
  it('inicia o OAuth Supabase e guarda o destino do Banco 1', async () => {
    await act(async () => renderLogin())
    const button = [...container.querySelectorAll('button')].find((item) => item.textContent === 'Acessar Banco 1')

    await act(async () => button?.click())

    expect(sessionStorage.getItem('sma:oauth-destination')).toBe('/?modulo=banco1')
    expect(startCorporateOAuth).toHaveBeenCalledTimes(1)
  })

  it('não inicia autenticação nem inventa fallback para Banco 2 sem URL configurada', async () => {
    await act(async () => renderLogin())
    const button = [...container.querySelectorAll('button')].find((item) => item.textContent === 'Acessar Banco 2')

    await act(async () => button?.click())

    expect(startCorporateOAuth).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Banco 2 indisponível')
  })

  it('exibe erro seguro quando o callback retorna não autorizado', async () => {
    await act(async () => renderLogin('/?authError=unauthorized'))

    expect(container.textContent).toContain('Não foi possível validar um perfil corporativo ativo')
  })
})
