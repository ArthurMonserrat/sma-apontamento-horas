import { describe, expect, it } from 'vitest'
import { isCorporateSession, localDataAccessError, resolveSessionActorId } from './sessionActor'
import type { CorporateProfile, DemoSession } from './types'

const corporateSession: DemoSession = {
  id: 'supabase-profile-1',
  name: 'Ana Silva',
  email: 'ana@example.invalid',
  role: 'COLLABORATOR',
  createdAt: '2026-10-18T12:00:00.000Z',
  explicitLoginAt: '2026-10-18T12:00:00.000Z',
  isDemo: false,
  version: 2,
  authProvider: 'supabase',
}

const authorizedProfile: CorporateProfile = {
  id: 'supabase-profile-1',
  email: 'ana@example.invalid',
  full_name: 'Ana Silva',
  role: 'colaborador',
  squad_id: 'squad-1',
  active: true,
}

describe('identidade do ator da sessão', () => {
  it('usa somente o perfil corporativo autorizado para uma sessão Supabase', () => {
    expect(resolveSessionActorId({
      session: corporateSession,
      profile: {
        id: 'demo-profile',
        name: 'Perfil demonstrativo',
        email: 'demo@example.invalid',
        jobTitle: 'Colaborador',
        active: true,
        location: { countryCode: 'BR', stateCode: 'SP', city: 'São Paulo', timeZone: 'America/Sao_Paulo' },
        activeSquadId: 'demo-squad',
      },
      corporateProfile: authorizedProfile,
    })).toBe('supabase-profile-1')
  })

  it('nega operação corporativa quando o perfil servidor está ausente, inativo ou vazio', () => {
    expect(resolveSessionActorId({ session: corporateSession, profile: null, corporateProfile: null })).toBeNull()
    expect(resolveSessionActorId({ session: corporateSession, profile: null, corporateProfile: { ...authorizedProfile, active: false } })).toBeNull()
    expect(resolveSessionActorId({ session: corporateSession, profile: null, corporateProfile: { ...authorizedProfile, id: '   ' } })).toBeNull()
  })

  it('mantém o perfil local isolado no modo demonstrativo', () => {
    const demoSession = { ...corporateSession, authProvider: 'demo' as const, isDemo: true }
    expect(isCorporateSession(demoSession)).toBe(false)
    expect(resolveSessionActorId({ session: demoSession, profile: { id: 'demo-profile', name: 'Demo', email: 'demo@example.invalid', jobTitle: 'Colaborador', active: true, location: { countryCode: 'BR', stateCode: 'SP', city: 'São Paulo', timeZone: 'America/Sao_Paulo' }, activeSquadId: 'demo-squad' }, corporateProfile: authorizedProfile })).toBe('demo-profile')
  })

  it('classifica apenas sessão Supabase não demonstrativa como corporativa', () => {
    expect(isCorporateSession(corporateSession)).toBe(true)
    expect(isCorporateSession(null)).toBe(false)
    expect(isCorporateSession({ ...corporateSession, isDemo: true })).toBe(false)
  })

  it('expõe erro explícito em vez de permitir que sessão corporativa use dados locais', () => {
    expect(localDataAccessError(corporateSession)).toBe('Dados demonstrativos não estão disponíveis para a sessão corporativa.')
    expect(localDataAccessError({ ...corporateSession, authProvider: 'demo', isDemo: true })).toBeNull()
  })
})
