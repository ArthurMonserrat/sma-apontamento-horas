import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ThemeContext } from '../../app/providers/themeContext'
import { DemoSessionProvider } from '../../features/session/DemoSessionProvider'
import { ProfileSelectionPage } from './ProfileSelectionPage'

function renderProfileSelection() {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/selecao-perfil']}>
      <ThemeContext.Provider value={{ theme: 'light', toggleTheme: vi.fn() }}>
        <DemoSessionProvider><ProfileSelectionPage /></DemoSessionProvider>
      </ThemeContext.Provider>
    </MemoryRouter>,
  )
}

describe('ProfileSelectionPage', () => {
  it('mantém a escolha dos três perfis separada da landing do ecossistema', () => {
    const markup = renderProfileSelection()

    expect(markup).toContain('Escolha seu perfil')
    expect(markup).toContain('Entrar como Colaborador')
    expect(markup).toContain('Entrar como Supervisão')
    expect(markup).toContain('Entrar como Direção')
  })
})
