import { describe, expect, it } from 'vitest'
import { hasAuthenticatedSession } from './authGuard'
import type { CorporateProfile, DemoRole, DemoSession } from './types'

function corporateSession(role: CorporateProfile['role'], active = true): DemoSession {
  const roles: Record<CorporateProfile['role'], DemoRole> = {
    colaborador: 'COLLABORATOR',
    supervisor: 'SUPERVISOR',
    diretor: 'DIRECTOR_ADMIN',
  }
  const corporateProfile: CorporateProfile = {
    id: 'user-1',
    email: 'user@example.com',
    full_name: 'Pessoa Usuária',
    role,
    squad_id: null,
    active,
  }
  return {
    id: 'user-1',
    name: 'Pessoa Usuária',
    email: 'user@example.com',
    role: roles[role],
    createdAt: '2026-10-20T00:00:00.000Z',
    explicitLoginAt: '2026-10-20T00:00:00.000Z',
    isDemo: false,
    version: 2,
    authProvider: 'supabase',
    corporateProfile,
  }
}

describe('autenticação das rotas internas', () => {
  it('nega conta MSAL ativa sem sessão corporativa provisionada', () => {
    expect(hasAuthenticatedSession(null)).toBe(false)
  })

  it('nega uma sessão Microsoft armazenada localmente como autorização corporativa', () => {
    expect(hasAuthenticatedSession({ authProvider: 'microsoft', isDemo: false } as DemoSession)).toBe(false)
  })

  it('aceita somente perfis Supabase ativos com cargos conhecidos', () => {
    expect(hasAuthenticatedSession(corporateSession('colaborador'))).toBe(true)
    expect(hasAuthenticatedSession(corporateSession('supervisor'))).toBe(true)
    expect(hasAuthenticatedSession(corporateSession('diretor'))).toBe(true)
    expect(hasAuthenticatedSession(corporateSession('colaborador', false))).toBe(false)
  })

  it('nega perfil ausente ou cargo sem correspondência interna', () => {
    const session = corporateSession('colaborador')
    expect(hasAuthenticatedSession({ ...session, corporateProfile: undefined })).toBe(false)
    expect(hasAuthenticatedSession({ ...session, corporateProfile: { ...session.corporateProfile!, role: 'owner' } as unknown as CorporateProfile })).toBe(false)
  })

  it('não trata sessão demo como autenticação corporativa', () => {
    expect(hasAuthenticatedSession({ authProvider: 'demo', isDemo: false } as DemoSession)).toBe(false)
    expect(hasAuthenticatedSession(null)).toBe(false)
  })

  it('preserva o modo demonstrativo', () => {
    expect(hasAuthenticatedSession({ authProvider: 'demo', isDemo: true } as DemoSession)).toBe(true)
    expect(hasAuthenticatedSession({ authProvider: undefined, isDemo: true } as DemoSession)).toBe(true)
  })

  it('não confia somente em um identificador local de sessão Supabase', () => {
    expect(hasAuthenticatedSession({ authProvider: 'supabase', isDemo: false } as DemoSession)).toBe(false)
  })
})
