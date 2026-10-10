import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../AppRoutes'
import { ThemeContext } from '../providers/themeContext'
import { demoCollaborator } from '../../mocks/demoData'
import { SessionContext } from '../../features/session/sessionContext'
import type { DemoRole, DemoSession } from '../../features/session/types'

function renderArea(role: DemoRole, path: string) {
  const session: DemoSession = {
    id: `demo-${role.toLowerCase()}`,
    name: role === 'COLLABORATOR' ? demoCollaborator.name : role === 'SUPERVISOR' ? 'Supervisor' : 'Diretoria',
    role,
    createdAt: '2026-09-15T00:00:00.000Z',
    explicitLoginAt: '2026-09-15T00:00:00.000Z',
    isDemo: true,
    version: 2,
    email: `${role.toLowerCase()}@sma.com`,
    authProvider: 'microsoft',
  }

  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <ThemeContext.Provider value={{ theme: 'light', toggleTheme: vi.fn() }}>
        <SessionContext.Provider value={{ session, profile: role === 'COLLABORATOR' ? demoCollaborator : null, isLoading: false, signIn: vi.fn(), signOut: vi.fn() }}>
          <AppRoutes />
        </SessionContext.Provider>
      </ThemeContext.Provider>
    </MemoryRouter>,
  )
}

function iconNames(markup: string) {
  return Array.from(markup.matchAll(/data-navigation-icon="([^"]+)"/g), ([, name]) => name)
}

describe('ícones das navegações laterais', () => {
  it('mostra ícones semânticos em todas as abas do Colaborador', () => {
    const markup = renderArea('COLLABORATOR', '/colaborador')
    const names = iconNames(markup)

    expect(new Set(names)).toEqual(new Set(['dashboard', 'file-plus', 'history', 'calendar-off', 'bell', 'user']))
    expect(markup).toContain('Avisos')
    expect(markup).not.toContain('Quadro de Avisos')
  })

  it('mostra ícones semânticos em todas as abas da Supervisão', () => {
    const names = iconNames(renderArea('SUPERVISOR', '/supervisor'))

    expect(names).toEqual(['users', 'inbox', 'history', 'bell', 'user'])
  })

  it('mostra ícones semânticos em todas as abas da Direção', () => {
    const names = iconNames(renderArea('DIRECTOR_ADMIN', '/administracao'))

    expect(names).toEqual(['dashboard', 'users', 'bar-chart', 'bell'])
  })
})
