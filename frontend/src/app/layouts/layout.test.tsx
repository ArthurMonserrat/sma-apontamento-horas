import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ThemeContext } from '../providers/themeContext'
import { demoCollaborator } from '../../mocks/demoData'
import { SessionContext } from '../../features/session/sessionContext'
import { ProtectedRoute } from '../../features/session/ProtectedRoute'
import { PublicOnlyRoute } from '../../features/session/PublicOnlyRoute'
import type { DemoSession } from '../../features/session/types'
import { AppLayout } from './AppLayout'
import { closeDrawerAfterNavigation, focusDrawerInitialElement, restoreDrawerTriggerFocus, scheduleDrawerTriggerFocus, shouldCloseDrawerForKey } from './drawer'
import { PageContainer } from '../../shared/ui/PageContainer'

const collaboratorSession: DemoSession = {
  id: demoCollaborator.id,
  name: demoCollaborator.name,
  role: 'COLLABORATOR',
  createdAt: '2026-07-21T15:30:00.000Z',
  explicitLoginAt: '2026-07-21T15:30:00.000Z',
  isDemo: true,
  version: 2,
  email: 'colaborador@sma.com',
  authProvider: 'microsoft',
}

const supervisorSession: DemoSession = {
  ...collaboratorSession,
  id: 'demo-supervisor-001',
  name: 'Supervisor',
  role: 'SUPERVISOR',
  email: 'supervisor@sma.com',
  authProvider: 'microsoft',
}

function renderLayout() {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/colaborador']}>
      <ThemeContext.Provider value={{ theme: 'light', toggleTheme: vi.fn() }}>
        <SessionContext.Provider value={{ session: collaboratorSession, profile: demoCollaborator, isLoading: false, signIn: vi.fn(), signOut: vi.fn() }}>
          <AppLayout />
        </SessionContext.Provider>
      </ThemeContext.Provider>
    </MemoryRouter>,
  )
}

function renderGuard(
  route: React.ReactNode,
  { session, profile = null }: { session: DemoSession | null; profile?: typeof demoCollaborator | null },
) {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  try {
    return renderToStaticMarkup(
      <MemoryRouter initialEntries={['/supervisor?periodo=atual#equipe']}>
        <SessionContext.Provider value={{ session, profile, isLoading: false, signIn: vi.fn(), signOut: vi.fn() }}>
          {route}
        </SessionContext.Provider>
      </MemoryRouter>,
    )
  } finally {
    warn.mockRestore()
  }
}

describe('layout responsivo do colaborador', () => {
  it('mantém sidebar desktop e drawer mobile como regiões independentes do shell', () => {
    const markup = renderLayout()
    const desktopStart = markup.indexOf('data-desktop-sidebar="true"')
    const desktopMarkup = markup.slice(desktopStart, markup.indexOf('</aside>', desktopStart))

    expect(markup).toContain('data-desktop-sidebar="true"')
    expect(markup).toContain('data-mobile-drawer="true"')
    expect(desktopStart).toBeLessThan(markup.indexOf('id="main-content"'))
    expect(markup.indexOf('id="main-content"')).toBeLessThan(markup.indexOf('data-mobile-drawer="true"'))
    expect(desktopMarkup).toContain('w-64')
    expect(desktopMarkup).toContain('md:flex')
    expect(desktopMarkup).not.toContain('invisible')
    expect(desktopMarkup).not.toContain('translate-x')
  })

  it('posiciona o header global antes da navegação lateral e do conteúdo', () => {
    const markup = renderLayout()
    expect(markup.indexOf('data-layout-region="global-header"')).toBeLessThan(markup.indexOf('data-desktop-sidebar="true"'))
    expect(markup.indexOf('data-desktop-sidebar="true"')).toBeLessThan(markup.indexOf('id="main-content"'))
  })

  it('exibe uma única logo oficial no header e não repete marca no cartão da squad', () => {
    const markup = renderLayout()
    const headerStart = markup.indexOf('data-layout-region="global-header"')
    const headerMarkup = markup.slice(headerStart, markup.indexOf('</header>', headerStart))
    const squadStart = markup.indexOf('Squad ativa')
    const squadMarkup = markup.slice(Math.max(0, squadStart - 300), squadStart + 300)

    expect(markup.match(/<img/g) ?? []).toHaveLength(1)
    expect(headerMarkup).toContain('sma-logo.jpg')
    expect(squadMarkup).not.toContain('sma-logo.jpg')
    expect(squadMarkup).not.toContain('SM&amp;A')
  })

  it('expõe estado e alvo do menu mobile para tecnologias assistivas', () => {
    const markup = renderLayout()
    expect(markup).toContain('aria-controls="collaborator-mobile-navigation"')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toContain('Fechar navegação lateral')
  })

  it('mantém o drawer abaixo do header sem reservar largura quando fechado', () => {
    const markup = renderLayout()
    const drawerStart = markup.indexOf('data-mobile-drawer="true"')
    const drawerMarkup = markup.slice(drawerStart, markup.indexOf('</aside>', drawerStart))

    expect(markup).toContain('top-20')
    expect(drawerMarkup).toContain('-translate-x-full')
    expect(drawerMarkup).toContain('md:hidden')
    expect(drawerMarkup).not.toContain('md:translate-x-0')
    expect(markup).toContain('md:grid-cols-[16rem_minmax(0,1fr)]')
    expect(markup).toContain('overflow-x-clip')
  })

  it('exibe o resumo profissional e todos os links principais na sidebar', () => {
    const markup = renderLayout()

    expect(markup).toContain('Colaborador')
    expect(markup).toContain('Projetista')
    expect(markup).toContain('Engenharia de Automação')
    for (const label of ['Visão geral', 'Novo apontamento', 'Histórico', 'Ausências', 'Meu perfil']) {
      expect(markup).toContain(label)
    }
  })

  it('separa sutilmente as ações de instalar aplicativo e sair do sistema', () => {
    const markup = renderLayout()
    const signOutStart = markup.indexOf('Sair do sistema')
    const signOutMarkup = markup.slice(Math.max(0, signOutStart - 360), signOutStart)

    expect(signOutMarkup).toContain('mt-3 w-full')
  })

  it('fecha o drawer somente com a tecla Escape', () => {
    expect(shouldCloseDrawerForKey('Escape')).toBe(true)
    expect(shouldCloseDrawerForKey('Enter')).toBe(false)
    expect(shouldCloseDrawerForKey('Tab')).toBe(false)
  })

  it('move o foco para o primeiro controle do drawer ao abrir', () => {
    const focus = vi.fn()
    const root = { querySelector: vi.fn(() => ({ focus })) } as unknown as ParentNode

    expect(focusDrawerInitialElement(root)).toBe(true)
    expect(root.querySelector).toHaveBeenCalledWith('[data-drawer-initial-focus]')
    expect(focus).toHaveBeenCalledOnce()
  })

  it('restaura o foco no acionador ao fechar explicitamente o drawer', () => {
    const focus = vi.fn()
    const trigger = { focus } as unknown as HTMLButtonElement

    expect(restoreDrawerTriggerFocus(trigger)).toBe(true)
    expect(focus).toHaveBeenCalledOnce()
    expect(restoreDrawerTriggerFocus(null)).toBe(false)
  })

  it('agenda o retorno do foco para depois da remoção do backdrop', () => {
    const focus = vi.fn()
    const trigger = { focus } as unknown as HTMLButtonElement
    const schedule = vi.fn<(callback: () => void) => void>()

    expect(scheduleDrawerTriggerFocus(trigger, schedule)).toBe(true)
    expect(focus).not.toHaveBeenCalled()
    schedule.mock.calls[0]?.[0]()
    expect(focus).toHaveBeenCalledOnce()
    expect(scheduleDrawerTriggerFocus(null, schedule)).toBe(false)
  })

  it('solicita retorno de foco ao fechar o drawer por navegação', () => {
    const close = vi.fn()

    closeDrawerAfterNavigation(close)

    expect(close).toHaveBeenCalledWith(true)
  })

  it('centraliza a página sem aplicar offset lateral manual', () => {
    const markup = renderToStaticMarkup(<PageContainer title="Página" description="Descrição" />)

    expect(markup).toContain('mx-auto')
    expect(markup).toContain('max-w-7xl')
    expect(markup).not.toContain('lg:ml-')
  })
})

describe('guardas da sessão corporativa', () => {
  it('autoriza a área pelo papel da sessão mesmo quando não existe perfil de colaborador', () => {
    const markup = renderGuard(
      <ProtectedRoute allowedRoles={['SUPERVISOR']}><p>Área da supervisão</p></ProtectedRoute>,
      { session: supervisorSession },
    )

    expect(markup).toContain('Área da supervisão')
  })

  it('não autoriza outra área apenas porque existe perfil de colaborador', () => {
    const markup = renderGuard(
      <ProtectedRoute allowedRoles={['SUPERVISOR']}><p>Área da supervisão</p></ProtectedRoute>,
      { session: collaboratorSession, profile: demoCollaborator },
    )

    expect(markup).not.toContain('Área da supervisão')
  })

  it('trata qualquer sessão válida como autenticada em rota pública', () => {
    const markup = renderGuard(
      <PublicOnlyRoute><p>Seleção de perfil</p></PublicOnlyRoute>,
      { session: supervisorSession },
    )

    expect(markup).not.toContain('Seleção de perfil')
  })

  it('mantém a seleção de perfil acessível sem sessão', () => {
    const markup = renderGuard(
      <PublicOnlyRoute><p>Seleção de perfil</p></PublicOnlyRoute>,
      { session: null },
    )

    expect(markup).toContain('Seleção de perfil')
  })
})
