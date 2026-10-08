import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ThemeContext } from './themeContext'
import { DemoSessionProvider } from '../features/session/DemoSessionProvider'
import { AppRoutes } from './AppRoutes'

vi.mock('@azure/msal-react', () => ({
  useMsal: () => ({
    accounts: [],
    inProgress: 'none',
    instance: { getActiveAccount: () => null },
  }),
}))

describe('rota raiz do ecossistema', () => {
  it('renderiza a seleção de bancos diretamente em /', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/']}>
        <ThemeContext.Provider value={{ theme: 'light', toggleTheme: () => undefined }}>
          <DemoSessionProvider><AppRoutes /></DemoSessionProvider>
        </ThemeContext.Provider>
      </MemoryRouter>,
    )

    expect(markup).toContain('Banco de Horas 1')
    expect(markup).toContain('Banco de Horas 2 (Campo e Estudos)')
  })
})
