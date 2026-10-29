// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeContext } from '../../app/providers/themeContext'
import { SessionContext } from '../../features/session/sessionContext'
import { startCorporateOAuth } from '../../features/auth/infrastructure/supabaseSessionService'
import { EcosystemLogin } from './EcosystemLogin'
import type { CorporateRole, DemoRole, DemoSession, ModuleAccess } from '../../features/session/types'

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

function corporateSession(role: DemoRole, corporateRole: CorporateRole, modules?: ModuleAccess[]): DemoSession {
  return {
    id: 'auth-user-1',
    name: 'Fernando',
    email: 'fernando@sma-eng.com.br',
    role,
    createdAt: '2026-10-24T00:00:00Z',
    explicitLoginAt: '2026-10-24T00:00:00Z',
    isDemo: false,
    version: 2,
    authProvider: 'supabase',
    corporateProfile: { id: 'auth-user-1', email: 'fernando@sma-eng.com.br', full_name: 'Fernando', role: corporateRole, active: true, ...(modules ? { modules } : {}) },
  }
}

type Banco2Options = { banco2Url?: string | null; openExternal?: (url: string) => void }

function renderLogin(path = '/', session: DemoSession | null = null, isLoading = false, banco2: Banco2Options = {}) {
  return root.render(
    <ThemeContext.Provider value={{ theme: 'light', toggleTheme: vi.fn() }}>
      <SessionContext.Provider value={{ session, profile: null, isLoading, signIn: vi.fn(), signOut: vi.fn() }}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/" element={<EcosystemLogin banco2Url={banco2.banco2Url ?? null} openExternal={banco2.openExternal ?? vi.fn()} />} />
            <Route path="/selecao-perfil" element={<p>Banco selecionado</p>} />
            <Route path="/colaborador" element={<p>Area colaborador</p>} />
            <Route path="/supervisor" element={<p>Area supervisor</p>} />
            <Route path="/administracao" element={<p>Area diretoria</p>} />
          </Routes>
        </MemoryRouter>
      </SessionContext.Provider>
    </ThemeContext.Provider>,
  )
}

describe('acesso ao ecossistema', () => {
  it('inicia o OAuth Supabase e guarda o destino do Banco 1', async () => {
    await act(async () => renderLogin())
    const button = [...container.querySelectorAll('button')].find((item) => item.textContent === 'Acessar Apontamento 1')

    await act(async () => button?.click())

    expect(sessionStorage.getItem('sma:oauth-destination')).toBe('/?modulo=banco1')
    expect(startCorporateOAuth).toHaveBeenCalledTimes(1)
  })

  it('não inicia autenticação nem inventa fallback para Banco 2 sem URL configurada', async () => {
    await act(async () => renderLogin())
    const button = [...container.querySelectorAll('button')].find((item) => item.textContent === 'Acessar Apontamento 2')

    await act(async () => button?.click())

    expect(startCorporateOAuth).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Apontamento 2 indisponível')
  })

  it('exibe erro seguro quando o callback retorna não autorizado', async () => {
    await act(async () => renderLogin('/?authError=unauthorized'))

    expect(container.textContent).toContain('Não foi possível validar um perfil corporativo ativo')
  })

  it.each([
    ['COLLABORATOR', 'colaborador', 'Area colaborador'],
    ['SUPERVISOR', 'supervisor', 'Area supervisor'],
    ['DIRECTOR_ADMIN', 'diretor', 'Area diretoria'],
  ] as const)('após o retorno do OAuth leva %s para a área do cargo', async (role, corporateRole, expected) => {
    await act(async () => renderLogin('/?modulo=banco1', corporateSession(role, corporateRole)))

    expect(container.textContent).toContain(expected)
    expect(startCorporateOAuth).not.toHaveBeenCalled()
  })

  it('aguarda a validação do perfil antes de redirecionar', async () => {
    await act(async () => renderLogin('/?modulo=banco1', null, true))

    expect(container.textContent).toContain('Validando sessão corporativa')
  })

  it('não redireciona sessão inconsistente (cargo diferente do perfil corporativo)', async () => {
    await act(async () => renderLogin('/?modulo=banco1', corporateSession('DIRECTOR_ADMIN', 'colaborador')))

    expect(container.textContent).toContain('Apontamento 1')
    expect(container.textContent).not.toContain('Area diretoria')
  })

  it('com sessão válida, Acessar Apontamento 1 entra direto sem novo OAuth', async () => {
    await act(async () => renderLogin('/', corporateSession('SUPERVISOR', 'supervisor')))
    expect(container.textContent).toContain('Apontamento 1')
    const button = [...container.querySelectorAll('button')].find((item) => item.textContent === 'Acessar Apontamento 1')

    await act(async () => button?.click())

    expect(container.textContent).toContain('Area supervisor')
    expect(startCorporateOAuth).not.toHaveBeenCalled()
  })

  const BANCO2 = 'https://banco2.sma-eng.com.br/'
  const findButton = (label: string) => [...container.querySelectorAll('button')].find((item) => item.textContent === label)

  it('bloqueia o Banco 1 para quem não tem acesso liberado e explica o motivo', async () => {
    await act(async () => renderLogin('/?modulo=banco1', corporateSession('COLLABORATOR', 'colaborador', [])))

    expect(container.textContent).toContain('não tem acesso ao Apontamento 1')
    expect(findButton('Sem acesso ao Apontamento 1')?.disabled).toBe(true)
    expect(container.textContent).not.toContain('Area colaborador')
  })

  it('usa o cargo definido para o Banco 1 quando ele difere do cargo geral', async () => {
    await act(async () => renderLogin('/?modulo=banco1', corporateSession('SUPERVISOR', 'colaborador', [{ module: 'BANCO_1', role: 'supervisor' }])))

    expect(container.textContent).toContain('Area supervisor')
  })

  it('após o OAuth abre o site do Banco 2 para quem tem acesso', async () => {
    const openExternal = vi.fn()
    await act(async () => renderLogin('/?modulo=banco2', corporateSession('COLLABORATOR', 'colaborador', [{ module: 'BANCO_2', role: 'colaborador' }]), false, { banco2Url: BANCO2, openExternal }))

    expect(openExternal).toHaveBeenCalledTimes(1)
    expect(openExternal).toHaveBeenCalledWith(BANCO2)
    expect(container.textContent).toContain('Abrindo o Apontamento 2')
  })

  it('não abre o Banco 2 sem acesso liberado', async () => {
    const openExternal = vi.fn()
    await act(async () => renderLogin('/?modulo=banco2', corporateSession('COLLABORATOR', 'colaborador', [{ module: 'BANCO_1', role: 'colaborador' }]), false, { banco2Url: BANCO2, openExternal }))

    expect(openExternal).not.toHaveBeenCalled()
    expect(container.textContent).toContain('não tem acesso ao Apontamento 2')
    expect(findButton('Sem acesso ao Apontamento 2')?.disabled).toBe(true)
  })

  it('sem login, Acessar Apontamento 2 inicia o OAuth com destino do Banco 2', async () => {
    await act(async () => renderLogin('/', null, false, { banco2Url: BANCO2 }))

    await act(async () => findButton('Acessar Apontamento 2')?.click())

    expect(sessionStorage.getItem('sma:oauth-destination')).toBe('/?modulo=banco2')
    expect(startCorporateOAuth).toHaveBeenCalledTimes(1)
  })

  it('usuário com os dois bancos vê os dois botões liberados', async () => {
    const openExternal = vi.fn()
    const both: ModuleAccess[] = [{ module: 'BANCO_1', role: 'colaborador' }, { module: 'BANCO_2', role: 'colaborador' }]
    await act(async () => renderLogin('/', corporateSession('COLLABORATOR', 'colaborador', both), false, { banco2Url: BANCO2, openExternal }))

    expect(findButton('Acessar Apontamento 1')?.disabled).toBe(false)
    await act(async () => findButton('Acessar Apontamento 2')?.click())
    expect(openExternal).toHaveBeenCalledWith(BANCO2)
  })
})
