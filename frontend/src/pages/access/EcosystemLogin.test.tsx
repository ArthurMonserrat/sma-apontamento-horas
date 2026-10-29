import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ThemeContext } from '../../app/providers/themeContext'
import { SessionContext } from '../../features/session/sessionContext'
import { EcosystemLogin } from './EcosystemLogin'
import { getBanco2Url, getEcosystemModulePath, isAllowedOAuthDestination } from './ecosystemModules'
import ecosystemLoginSource from './EcosystemLogin.tsx?raw'
import portalSource from './Portal.tsx?raw'

vi.mock('../../features/auth/infrastructure/supabaseSessionService', () => ({ startCorporateOAuth: vi.fn() }))

function renderEcosystemLogin() {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/']}>
      <ThemeContext.Provider value={{ theme: 'light', toggleTheme: vi.fn() }}>
        <SessionContext.Provider value={{ session: null, profile: null, isLoading: false, signIn: vi.fn(), signInWithMicrosoft: vi.fn(), markAuthReady: vi.fn(), signOut: vi.fn() }}>
          <EcosystemLogin />
        </SessionContext.Provider>
      </ThemeContext.Provider>
    </MemoryRouter>,
  )
}

describe('EcosystemLogin', () => {
  it('apresenta os dois bancos como porta de entrada do ecossistema', () => {
    const markup = renderEcosystemLogin()

    expect(markup).toContain('Ecossistema SM&amp;A')
    expect(markup).toContain('Selecione o sistema que deseja acessar')
    expect(markup).toContain('flex flex-col items-center justify-center gap-3')
    expect(markup).toContain('Apontamento 1')
    expect(markup).toContain('3º e 7º andar')
    expect(markup).toContain('Apontamento 2')
    expect(markup).toContain('1º e 8º andar')
    expect(markup).toContain('Apontamento 2')
    expect(markup).not.toContain('Escolha seu perfil')
    expect(markup).toContain('Acessar Apontamento 1')
    expect(markup).toContain('Apontamento 2 indisponível')
  })

  it('não aponta módulos para a seleção manual de cargos', () => {
    expect(getEcosystemModulePath('BANCO_1')).toBe('/?modulo=banco1')
    expect(getEcosystemModulePath('BANCO_2')).toBe('/?modulo=banco2')
    expect(isAllowedOAuthDestination('/?modulo=banco1')).toBe(true)
    expect(isAllowedOAuthDestination('/?modulo=banco2')).toBe(true)
    expect(isAllowedOAuthDestination('https://banco2.example.com')).toBe(false)
    expect(isAllowedOAuthDestination('/selecao-perfil')).toBe(false)
  })

  it('só aceita endereço seguro para o site do Banco 2', () => {
    expect(getBanco2Url('https://banco2.sma-eng.com.br')).toBe('https://banco2.sma-eng.com.br/')
    expect(getBanco2Url('http://localhost:5174')).toBe('http://localhost:5174/')
    expect(getBanco2Url('http://banco2.sma-eng.com.br')).toBeNull()
    expect(getBanco2Url('javascript:alert(1)')).toBeNull()
    expect(getBanco2Url('')).toBeNull()
    expect(getBanco2Url(undefined)).toBeNull()
  })

  it('usa Supabase OAuth e não oferece entrada demonstrativa', () => {
    expect(ecosystemLoginSource).toContain('startCorporateOAuth')
    expect(ecosystemLoginSource).not.toContain('loginRedirect')
    expect(ecosystemLoginSource).not.toContain('useMsal')
    expect(ecosystemLoginSource).not.toContain('modo demonstrativo')
    expect(ecosystemLoginSource).not.toContain('VITE_BANCO_HORAS_2_URL')
    expect(portalSource).not.toContain('VITE_BANCO_HORAS_2_URL')
  })
})
