import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ThemeContext } from '../app/themeContext'
import { DemoSessionProvider } from '../features/session/DemoSessionProvider'
import { EcosystemLogin } from './EcosystemLogin'
import { getEcosystemModulePath } from './ecosystemModules'

vi.mock('@azure/msal-react', () => ({
  useMsal: () => ({
    accounts: [],
    inProgress: 'none',
    instance: { getActiveAccount: () => null },
  }),
}))

function renderEcosystemLogin() {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/']}>
      <ThemeContext.Provider value={{ theme: 'light', toggleTheme: vi.fn() }}>
        <DemoSessionProvider><EcosystemLogin /></DemoSessionProvider>
      </ThemeContext.Provider>
    </MemoryRouter>,
  )
}

describe('EcosystemLogin', () => {
  it('apresenta os dois bancos como porta de entrada do ecossistema', () => {
    const markup = renderEcosystemLogin()

    expect(markup).toContain('Ecossistema SM&amp;A')
    expect(markup).toContain('Selecione o sistema que deseja acessar')
    expect(markup).toContain('Banco de Horas 1')
    expect(markup).toContain('Banco de Horas 2 (Campo e Estudos)')
    expect(markup).not.toContain('Escolha seu perfil')
  })

  it('mantém destinos distintos para a seleção de cada banco', () => {
    expect(getEcosystemModulePath('BANCO_1')).toBe('/selecao-perfil?modulo=banco1')
    expect(getEcosystemModulePath('BANCO_2')).toBe('/selecao-perfil?modulo=banco2')
  })
})
