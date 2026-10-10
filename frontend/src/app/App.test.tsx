import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    BrowserRouter: ({ children }: { children: React.ReactNode }) => <div data-router="browser">{children}</div>,
    HashRouter: ({ children }: { children: React.ReactNode }) => <div data-router="hash">{children}</div>,
  }
})

vi.mock('./AppRoutes', () => ({ AppRoutes: () => <div data-routes="app" /> }))
vi.mock('./providers/OnboardingTour', () => ({ OnboardingTour: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('../features/offline/useOfflineSync', () => ({ OfflineSyncProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }))

import { App } from './App'

describe('App', () => {
  it('monta as rotas com o roteador do histórico do navegador', () => {
    const markup = renderToStaticMarkup(<App />)

    expect(markup).toContain('data-router="browser"')
    expect(markup).toContain('data-routes="app"')
  })
})
