// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionContext } from '../../features/session/sessionContext'
import type { DemoSession } from '../../features/session/types'
import type { Comunicado } from '../../features/announcements/types'
import type { AnnouncementRepository } from '../../features/announcements/infrastructure/announcementRepository'
import { AvisosPage } from './AvisosPage'

let root: Root
let container: HTMLDivElement

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

const director: DemoSession = { id: 'diretor', name: 'Fernando Almeida', role: 'DIRECTOR_ADMIN', createdAt: '', explicitLoginAt: '', isDemo: false, version: 2, authProvider: 'supabase' }

function aviso(id: string, titulo: string): Comunicado {
  return { id, titulo, mensagem: 'm', dataPublicacao: '2026-10-27T12:00:00Z', timestamp: '2026-10-27T12:00:00Z', autor: 'Fernando Almeida', autorId: 'diretor', oculto_por: [], tipo: 'info', urgencia: 'info', tipo_destinatario: 'all', alvo_referencia: null }
}

describe('AvisosPage com repositório', () => {
  it('lista, publica e exclui pelo repositório (banco de dados)', async () => {
    let stored = [aviso('1', 'Fechamento antecipado')]
    const repository: AnnouncementRepository = {
      list: vi.fn(async () => stored),
      create: vi.fn(async (input) => { stored = [aviso('2', input.titulo), ...stored] }),
      remove: vi.fn(async (id) => { stored = stored.filter((item) => item.id !== id); return true }),
      hide: vi.fn(async () => true),
      markRead: vi.fn(async () => undefined),
    }
    await act(async () => {
      root.render(<SessionContext.Provider value={{ session: director, profile: null, isLoading: false, signIn: vi.fn(), signOut: vi.fn() }}>
        <AvisosPage embedded repository={repository} />
      </SessionContext.Provider>)
    })
    expect(container.textContent).toContain('Fechamento antecipado')
    expect(container.textContent).toContain('por Fernando Almeida')

    const [title] = Array.from(container.querySelectorAll('input'))
    const textarea = container.querySelector('textarea')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(title, 'Novo aviso')
      title.dispatchEvent(new Event('input', { bubbles: true }))
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, 'Texto')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ titulo: 'Novo aviso', mensagem: 'Texto', tipoDestinatario: 'all', alvoReferencia: null }))
    await act(async () => { window.dispatchEvent(new CustomEvent('sma:announcements-updated')) })
    expect(container.textContent).toContain('Novo aviso')

    const deleteButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Excluir'))!
    await act(async () => { deleteButton.click() })
    expect(repository.remove).toHaveBeenCalled()
  })

  it('mostra o erro do banco ao carregar', async () => {
    const repository = { list: vi.fn(async () => { throw new Error('Não foi possível carregar os avisos.') }), create: vi.fn(), remove: vi.fn(), hide: vi.fn(), markRead: vi.fn() } as unknown as AnnouncementRepository
    await act(async () => {
      root.render(<SessionContext.Provider value={{ session: director, profile: null, isLoading: false, signIn: vi.fn(), signOut: vi.fn() }}>
        <AvisosPage embedded repository={repository} />
      </SessionContext.Provider>)
    })
    expect(container.textContent).toContain('Não foi possível carregar os avisos.')
  })
})
