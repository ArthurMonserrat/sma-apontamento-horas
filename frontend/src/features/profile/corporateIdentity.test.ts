import type { User } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import type { CorporateProfile } from '../session/types'
import { buildCorporateIdentity, formatDateTimePtBr, nameFromEmail, resolveDisplayName, splitFullName } from './corporateIdentity'

const profile: CorporateProfile = {
  id: 'auth-user-1',
  email: 'fernando.almeida@sma-eng.com.br',
  full_name: 'Fernando Almeida',
  role: 'diretor',
  active: true,
}

function authUser(overrides: Partial<User> = {}): User {
  return {
    id: 'auth-user-1',
    aud: 'authenticated',
    app_metadata: { provider: 'azure' },
    user_metadata: {},
    created_at: '2026-10-20T14:30:00Z',
    last_sign_in_at: '2026-10-24T18:00:00Z',
    ...overrides,
  } as User
}

describe('nome a partir do e-mail', () => {
  it.each([
    ['fernando.almeida@sma-eng.com.br', 'Fernando Almeida'],
    ['ana_maria-souza@sma-eng.com.br', 'Ana Maria Souza'],
    ['joao.da.silva@sma-eng.com.br', 'Joao da Silva'],
    ['JOSE@sma-eng.com.br', 'Jose'],
    ['fernando.almeida2@sma-eng.com.br', 'Fernando Almeida2'],
  ])('%s -> %s', (email, expected) => {
    expect(nameFromEmail(email)).toBe(expected)
  })
})

describe('separação de nome e sobrenome', () => {
  it('usa a primeira palavra como nome e o restante como sobrenome', () => {
    expect(splitFullName('  Ana   Maria Souza ')).toEqual({ firstName: 'Ana', lastName: 'Maria Souza' })
    expect(splitFullName('Fernando')).toEqual({ firstName: 'Fernando', lastName: '' })
  })
})

describe('resolveDisplayName', () => {
  it('prefere o nome do perfil corporativo', () => {
    expect(resolveDisplayName(profile, authUser({ user_metadata: { full_name: 'Outro Nome' } }))).toBe('Fernando Almeida')
  })

  it('usa o nome enviado pela Microsoft quando o perfil só tem o usuário do e-mail', () => {
    const handleProfile = { ...profile, full_name: 'fernando.almeida' }
    expect(resolveDisplayName(handleProfile, authUser({ user_metadata: { name: 'Fernando Not Almeida' } }))).toBe('Fernando Not Almeida')
  })

  it('deriva do e-mail quando não há nome real disponível', () => {
    const handleProfile = { ...profile, full_name: 'fernando.almeida' }
    expect(resolveDisplayName(handleProfile, null)).toBe('Fernando Almeida')
  })
})

describe('buildCorporateIdentity', () => {
  it('monta o perfil do diretor com dados do login Microsoft', () => {
    const identity = buildCorporateIdentity(profile, authUser())

    expect(identity).toMatchObject({
      firstName: 'Fernando',
      lastName: 'Almeida',
      fullName: 'Fernando Almeida',
      initials: 'FA',
      email: 'fernando.almeida@sma-eng.com.br',
      roleLabel: 'Diretoria',
      active: true,
      providerLabel: 'Microsoft (conta corporativa SM&A)',
      firstAccessAt: '2026-10-20T14:30:00Z',
      lastSignInAt: '2026-10-24T18:00:00Z',
    })
  })

  it('funciona sem a sessão Supabase (datas ficam vazias)', () => {
    const identity = buildCorporateIdentity(profile, null)
    expect(identity.firstAccessAt).toBeNull()
    expect(identity.lastSignInAt).toBeNull()
    expect(formatDateTimePtBr(identity.lastSignInAt)).toBe('Não informado')
  })

  it('formata datas no fuso de São Paulo', () => {
    expect(formatDateTimePtBr('2026-10-24T18:00:00Z')).toBe('24/10/2026, 15:00')
  })
})
