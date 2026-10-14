import { describe, expect, it } from 'vitest'
import { hasAuthenticatedSession } from './authGuard'

describe('autenticação das rotas internas', () => {
  it('nega conta MSAL ativa sem sessão corporativa provisionada', () => {
    expect(hasAuthenticatedSession(null, { homeAccountId: 'account-1' })).toBe(false)
  })

  it('nega uma sessão Microsoft armazenada localmente como autorização corporativa', () => {
    expect(hasAuthenticatedSession({ authProvider: 'microsoft', isDemo: false }, null)).toBe(false)
  })

  it('não trata sessão demo como autenticação corporativa', () => {
    expect(hasAuthenticatedSession({ authProvider: 'demo', isDemo: false } as never, null)).toBe(false)
    expect(hasAuthenticatedSession(null, null)).toBe(false)
  })

  it('preserva o modo demonstrativo sem transformá-lo em sessão corporativa', () => {
    expect(hasAuthenticatedSession({ authProvider: 'demo', isDemo: true } as never, null)).toBe(true)
  })

  it('não confia somente em um identificador local de sessão Supabase', () => {
    expect(hasAuthenticatedSession({ authProvider: 'supabase', isDemo: false }, null)).toBe(false)
  })
})
