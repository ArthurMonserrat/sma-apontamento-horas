import { describe, expect, it } from 'vitest'
import {
  isCorporateAuthorizationReady,
  isLegacyMsalAllowed,
  readBearerToken,
  validateMicrosoftIdentity,
} from '../../server/corporateAuthPolicy.js'

describe('corporateAuthPolicy', () => {
  it('mantém a autorização fechada mesmo quando a flag futura está como true', () => {
    expect(isCorporateAuthorizationReady({ CORPORATE_AUTHORIZATION_READY: 'true' })).toBe(false)
  })

  it('só permite o legado fora de produção com flag explícita', () => {
    expect(isLegacyMsalAllowed({ NODE_ENV: 'development', ENABLE_LEGACY_MSAL: 'true' })).toBe(true)
    expect(isLegacyMsalAllowed({ NODE_ENV: 'production', ENABLE_LEGACY_MSAL: 'true' })).toBe(false)
    expect(isLegacyMsalAllowed({ NODE_ENV: 'development', ENABLE_LEGACY_MSAL: 'false' })).toBe(false)
  })

  it('lê somente bearer token do cabeçalho Authorization', () => {
    expect(readBearerToken({ headers: { authorization: 'Bearer supabase-token' }, query: {} })).toBe('supabase-token')
    expect(readBearerToken({ headers: { authorization: 'Basic secret' }, query: {} })).toBeNull()
    expect(readBearerToken({ headers: { cookie: 'sma_session=legacy-token' }, query: {} })).toBeNull()
  })

  it('valida tenant e object id a partir de claims confiáveis', () => {
    expect(validateMicrosoftIdentity({ tid: 'tenant-1', oid: 'object-1' }, 'tenant-1')).toEqual({
      tenantId: 'tenant-1',
      objectId: 'object-1',
      emailVerified: false,
    })
  })

  it('nega tenant divergente, oid ausente e xms_edov falso', () => {
    expect(validateMicrosoftIdentity({ tid: 'other', oid: 'object-1' }, 'tenant-1')).toBeNull()
    expect(validateMicrosoftIdentity({ tid: 'tenant-1' }, 'tenant-1')).toBeNull()
    expect(validateMicrosoftIdentity({ tid: 'tenant-1', oid: 'object-1', xms_edov: false }, 'tenant-1')).toBeNull()
  })

  it('aceita xms_edov verdadeiro como reforço, sem usá-lo como chave de identidade', () => {
    expect(validateMicrosoftIdentity({ tid: 'tenant-1', oid: 'object-1', xms_edov: true }, 'tenant-1')).toEqual({
      tenantId: 'tenant-1',
      objectId: 'object-1',
      emailVerified: true,
    })
  })
})
