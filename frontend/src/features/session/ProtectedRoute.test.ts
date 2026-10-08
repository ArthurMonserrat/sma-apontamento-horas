import { describe, expect, it } from 'vitest'
import { hasAuthenticatedSession } from './authGuard'

describe('autenticação das rotas internas', () => {
  it('aceita uma conta MSAL ativa', () => {
    expect(hasAuthenticatedSession(null, { homeAccountId: 'account-1' })).toBe(true)
  })

  it('aceita uma sessão emitida pelo BFF Microsoft', () => {
    expect(hasAuthenticatedSession({ authProvider: 'microsoft' } as never, null)).toBe(true)
  })

  it('não trata sessão demo como autenticação corporativa', () => {
    expect(hasAuthenticatedSession({ authProvider: 'demo' } as never, null)).toBe(false)
    expect(hasAuthenticatedSession(null, null)).toBe(false)
  })
})
