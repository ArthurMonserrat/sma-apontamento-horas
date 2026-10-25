// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionContext } from './sessionContext'
import type { DemoSession, ModuleAccess } from './types'
import { SwitchSystemButton } from './SwitchSystemButton'

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

function session(modules?: ModuleAccess[]): DemoSession {
  return {
    id: 'u1', name: 'Fernando Almeida', role: 'DIRECTOR_ADMIN', createdAt: '', explicitLoginAt: '', isDemo: false, version: 2,
    authProvider: 'supabase',
    corporateProfile: { id: 'u1', email: 'fernando.almeida@sma-eng.com.br', full_name: 'Fernando Almeida', role: 'diretor', active: true, ...(modules ? { modules } : {}) },
  }
}

async function render(value: DemoSession | null) {
  await act(async () => {
    root.render(
      <SessionContext.Provider value={{ session: value, profile: null, isLoading: false, signIn: vi.fn(), signOut: vi.fn() }}>
        <MemoryRouter initialEntries={['/administracao']}>
          <Routes>
            <Route path="/" element={<p>Tela do Ecossistema</p>} />
            <Route path="/administracao" element={<SwitchSystemButton />} />
          </Routes>
        </MemoryRouter>
      </SessionContext.Provider>,
    )
  })
}

describe('Trocar de sistema', () => {
  it('aparece para quem tem Banco 1 e Banco 2 e volta para o Ecossistema sem sair da conta', async () => {
    await render(session([{ module: 'BANCO_1', role: 'diretor' }, { module: 'BANCO_2', role: 'diretor' }]))
    const button = container.querySelector('button')
    expect(button?.textContent).toContain('Trocar de sistema')

    await act(async () => button?.click())

    expect(container.textContent).toContain('Tela do Ecossistema')
  })

  it('não aparece para quem só tem um banco', async () => {
    await render(session([{ module: 'BANCO_1', role: 'diretor' }]))
    expect(container.querySelector('button')).toBeNull()
  })

  it('não aparece sem sessão corporativa', async () => {
    await render(null)
    expect(container.querySelector('button')).toBeNull()
  })
})
