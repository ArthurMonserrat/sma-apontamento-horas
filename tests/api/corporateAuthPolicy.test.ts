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

  it('não trata claims recebidas pelo chamador como evidência criptográfica', () => {
    expect(validateMicrosoftIdentity({ tid: 'tenant-1', oid: 'object-1' }, 'tenant-1')).toBeNull()
    expect(validateMicrosoftIdentity({ tid: 'tenant-1', oid: 'object-1', cryptographicallyVerified: true }, 'tenant-1')).toBeNull()
    expect(validateMicrosoftIdentity({ email: 'person@example.com', tid: 'tenant-1', oid: 'object-1' }, 'tenant-1')).toBeNull()
  })

  it('nega entradas externas com tenant divergente, oid ausente ou xms_edov falso', () => {
    expect(validateMicrosoftIdentity({ tid: 'other', oid: 'object-1' }, 'tenant-1')).toBeNull()
    expect(validateMicrosoftIdentity({ tid: 'tenant-1' }, 'tenant-1')).toBeNull()
    expect(validateMicrosoftIdentity({ tid: 'tenant-1', oid: 'object-1', xms_edov: false }, 'tenant-1')).toBeNull()
  })
})
