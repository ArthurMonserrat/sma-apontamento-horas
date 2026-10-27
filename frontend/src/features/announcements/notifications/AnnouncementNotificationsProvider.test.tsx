// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionContext } from '../../session/sessionContext'
import type { DemoSession } from '../../session/types'
import type { Comunicado } from '../types'
import type { AnnouncementRepository } from '../infrastructure/announcementRepository'
import { AnnouncementNotificationsProvider } from './AnnouncementNotificationsProvider'
import { AnnouncementBadge } from './AnnouncementBadge'
import { useAnnouncementNotifications } from './announcementNotificationsContext'

let root: Root
let container: HTMLDivElement

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const hugo: DemoSession = { id: 'hugo', name: 'Hugo Barbosa', role: 'COLLABORATOR', createdAt: '', explicitLoginAt: '', isDemo: false, version: 2, authProvider: 'supabase' }

function aviso(id: string, titulo: string, extra: Partial<Comunicado> = {}): Comunicado {
  return { id, titulo, mensagem: `Mensagem ${id}`, dataPublicacao: '2026-10-28T12:00:00Z', timestamp: '2026-10-28T12:00:00Z', autor: 'Fernando Almeida', autorId: 'diretor', oculto_por: [], tipo: 'info', urgencia: 'info', tipo_destinatario: 'all', alvo_referencia: null, lido: false, ...extra }
}

function MarkAll() {
  const { markAllRead } = useAnnouncementNotifications()
  return <button type="button" onClick={() => void markAllRead()}>marcar</button>
}

async function render(repository: AnnouncementRepository) {
  await act(async () => {
    root.render(<SessionContext.Provider value={{ session: hugo, profile: null, isLoading: false, signIn: vi.fn(), signOut: vi.fn() }}>
      <MemoryRouter initialEntries={['/colaborador']}>
        <AnnouncementNotificationsProvider repository={repository} pollIntervalMs={60_000}>
          <Routes>
            <Route path="/colaborador" element={<nav>Avisos <AnnouncementBadge /><MarkAll /></nav>} />
            <Route path="/colaborador/avisos" element={<h1>Tela de avisos</h1>} />
          </Routes>
        </AnnouncementNotificationsProvider>
      </MemoryRouter>
    </SessionContext.Provider>)
  })
}

describe('AnnouncementNotificationsProvider', () => {
  it('mostra o contador e o balão dos avisos não lidos; lidos e ocultos não contam', async () => {
    let stored = [aviso('1', 'Fechamento antecipado'), aviso('2', 'Já lido', { lido: true }), aviso('3', 'Oculto', { oculto_por: ['hugo'] })]
    const repository: AnnouncementRepository = {
      list: vi.fn(async () => stored), create: vi.fn(), remove: vi.fn(), hide: vi.fn(),
      markRead: vi.fn(async (ids: string[]) => { stored = stored.map((item) => ids.includes(item.id) ? { ...item, lido: true } : item) }),
    }
    await render(repository)
    expect(container.querySelector('[aria-label="1 aviso(s) não lido(s)"]')?.textContent).toBe('1')
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Aviso não lido: Fechamento antecipado')

    // Chega um aviso novo na próxima consulta (ex.: ao voltar para a aba).
    stored = [aviso('4', 'Reunião geral', { urgencia: 'urgente', tipo: 'urgente' }), ...stored]
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    expect(container.querySelector('[aria-label="2 aviso(s) não lido(s)"]')).toBeTruthy()
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Novo aviso: Reunião geral')

    // "Ver avisos" leva para a tela de Avisos do perfil.
    const ver = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Ver avisos')!
    await act(async () => { ver.click() })
    expect(container.textContent).toContain('Tela de avisos')
  })

  it('zera o contador ao marcar como lidos', async () => {
    let stored = [aviso('1', 'A'), aviso('2', 'B')]
    const repository: AnnouncementRepository = {
      list: vi.fn(async () => stored), create: vi.fn(), remove: vi.fn(), hide: vi.fn(),
      markRead: vi.fn(async (ids: string[]) => { stored = stored.map((item) => ids.includes(item.id) ? { ...item, lido: true } : item) }),
    }
    await render(repository)
    expect(container.querySelector('[aria-label="2 aviso(s) não lido(s)"]')).toBeTruthy()
    const marcar = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'marcar')!
    await act(async () => { marcar.click() })
    expect(repository.markRead).toHaveBeenCalledWith(['1', '2'], 'hugo')
    expect(container.querySelector('[aria-label$="não lido(s)"]')).toBeNull()
  })
})
