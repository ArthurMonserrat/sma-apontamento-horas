import { describe, expect, it } from 'vitest'
import { mapMicrosoftClaimsToRole } from './claims'

describe('mapeamento de claims Microsoft para roles internas', () => {
  it('prioriza Diretor quando a claim contém uma role administrativa', () => {
    expect(mapMicrosoftClaimsToRole({ roles: ['Supervisor', 'Admin'] })).toBe('DIRECTOR_ADMIN')
  })

  it('reconhece Supervisor em roles ou groups', () => {
    expect(mapMicrosoftClaimsToRole({ roles: ['Supervisor'] })).toBe('SUPERVISOR')
    expect(mapMicrosoftClaimsToRole({ groups: ['grupo-supervisores'] })).toBe('SUPERVISOR')
  })

  it('nega claims ausentes ou desconhecidas em vez de conceder colaborador', () => {
    expect(mapMicrosoftClaimsToRole({})).toBeNull()
    expect(mapMicrosoftClaimsToRole({ roles: ['User'] })).toBeNull()
  })
})
