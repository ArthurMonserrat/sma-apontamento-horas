import { describe, expect, it } from 'vitest'
import { verifySupabaseAzureBinding } from '../../server/entraIdentityVerifier.js'

describe('Supabase to Entra identity binding', () => {
  it('terminates malformed runtime input without throwing', () => {
    expect(verifySupabaseAzureBinding(null, { expectedTenantId: 'tenant-1' })).toEqual({ status: 'invalid', reason: 'invalid_input' })
    expect(verifySupabaseAzureBinding({ supabaseUserId: 'supabase-a', identities: null }, { expectedTenantId: 'tenant-1' })).toEqual({ status: 'invalid', reason: 'invalid_input' })
  })

  it('rejects an identity record from another Supabase user', () => {
    expect(verifySupabaseAzureBinding({
      supabaseUserId: 'supabase-a',
      identities: [{ userId: 'supabase-b', provider: 'azure', providerId: 'object-1', identityData: { tid: 'tenant-1', oid: 'object-1' } }],
      microsoftClaims: null,
    }, { expectedTenantId: 'tenant-1' })).toEqual({ status: 'invalid', reason: 'identity_user_mismatch' })
  })

  it('does not treat provider_id, email, metadata, or a boolean as tid/oid proof', () => {
    expect(verifySupabaseAzureBinding({
      supabaseUserId: 'supabase-a',
      identities: [{ userId: 'supabase-a', provider: 'azure', providerId: 'object-1', identityData: { email: 'person@example.com', tid: 'tenant-1', oid: 'object-1', cryptographicallyVerified: true } }],
      microsoftClaims: { tid: 'tenant-1', oid: 'object-1', cryptographicallyVerified: true },
    }, { expectedTenantId: 'tenant-1' })).toEqual({ status: 'unavailable', reason: 'verified_provider_evidence_missing' })
  })

  it('fails closed when Azure identity is absent, duplicated, or from another provider', () => {
    expect(verifySupabaseAzureBinding({ supabaseUserId: 'supabase-a', identities: [], microsoftClaims: null }, { expectedTenantId: 'tenant-1' })).toEqual({ status: 'invalid', reason: 'azure_identity_missing' })
    expect(verifySupabaseAzureBinding({
      supabaseUserId: 'supabase-a',
      identities: [
        { userId: 'supabase-a', provider: 'azure', providerId: 'object-1', identityData: {} },
        { userId: 'supabase-a', provider: 'azure', providerId: 'object-2', identityData: {} },
      ],
      microsoftClaims: null,
    }, { expectedTenantId: 'tenant-1' })).toEqual({ status: 'invalid', reason: 'multiple_azure_identities' })
    expect(verifySupabaseAzureBinding({
      supabaseUserId: 'supabase-a',
      identities: [{ userId: 'supabase-a', provider: 'google', providerId: 'subject-1', identityData: {} }],
      microsoftClaims: null,
    }, { expectedTenantId: 'tenant-1' })).toEqual({ status: 'invalid', reason: 'azure_identity_missing' })
  })
})
