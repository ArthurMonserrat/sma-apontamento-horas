import { describe, expect, it } from 'vitest'
import { evaluateCorporateAuthorization } from '../../server/corporateAuthorization.js'

const tenantId = '11111111-1111-1111-1111-111111111111'
const objectId = '33333333-3333-3333-3333-333333333333'

const baseInput = {
  session: { userId: 'auth-user-1', identityUserId: 'auth-user-1' },
  binding: {
    status: 'verified',
    tenantId,
    objectId,
    supabaseUserId: 'auth-user-1',
  },
  preapproval: {
    email: 'employee@example.com',
    fullName: 'Employee Example',
    role: 'colaborador' as const,
    active: true,
    microsoftTenantId: tenantId,
    microsoftObjectId: objectId,
  },
  profile: {
    id: 'profile-1',
    authUserId: 'auth-user-1',
    role: 'colaborador' as const,
    active: true,
  },
}

describe('corporate authorization evaluator', () => {
  it('denies when the Supabase session is absent or identity rows do not match', () => {
    expect(evaluateCorporateAuthorization({ ...baseInput, session: null })).toEqual({ status: 'denied', reason: 'session_missing' })
    expect(evaluateCorporateAuthorization({ ...baseInput, session: { userId: 'auth-user-1', identityUserId: 'auth-user-2' } })).toEqual({ status: 'denied', reason: 'session_identity_mismatch' })
  })

  it('denies a shape-only verified binding without the private server marker', () => {
    expect(evaluateCorporateAuthorization(baseInput)).toEqual({ status: 'denied', reason: 'binding_unavailable' })
  })

  it('denies a binding for another Supabase user, a wrong tenant, or expired evidence', () => {
    expect(evaluateCorporateAuthorization({ ...baseInput, binding: { ...baseInput.binding, supabaseUserId: 'auth-user-2' } })).toEqual({ status: 'denied', reason: 'binding_identity_mismatch' })
    expect(evaluateCorporateAuthorization({ ...baseInput, binding: { ...baseInput.binding, tenantId: '44444444-4444-4444-4444-444444444444' } })).toEqual({ status: 'denied', reason: 'binding_unavailable' })
  })

  it('denies missing, inactive, or identity-incomplete pre-authorizations', () => {
    expect(evaluateCorporateAuthorization({ ...baseInput, preapproval: null })).toEqual({ status: 'denied', reason: 'preapproval_missing' })
    expect(evaluateCorporateAuthorization({ ...baseInput, preapproval: { ...baseInput.preapproval, active: false } })).toEqual({ status: 'denied', reason: 'preapproval_inactive' })
    expect(evaluateCorporateAuthorization({ ...baseInput, preapproval: { ...baseInput.preapproval, microsoftObjectId: null } })).toEqual({ status: 'denied', reason: 'preapproval_identity_missing' })
  })

  it('denies mismatched pre-authorizations and profiles without defaulting a role', () => {
    expect(evaluateCorporateAuthorization({ ...baseInput, preapproval: { ...baseInput.preapproval, microsoftObjectId: '55555555-5555-5555-5555-555555555555' } })).toEqual({ status: 'denied', reason: 'binding_unavailable' })
    expect(evaluateCorporateAuthorization({ ...baseInput, profile: null })).toEqual({ status: 'denied', reason: 'profile_missing' })
    expect(evaluateCorporateAuthorization({ ...baseInput, profile: { ...baseInput.profile, active: false } })).toEqual({ status: 'denied', reason: 'profile_inactive' })
    expect(evaluateCorporateAuthorization({ ...baseInput, profile: { ...baseInput.profile, authUserId: null } })).toEqual({ status: 'denied', reason: 'profile_identity_mismatch' })
    expect(evaluateCorporateAuthorization({ ...baseInput, profile: { ...baseInput.profile, role: 'diretor' } })).toEqual({ status: 'denied', reason: 'profile_role_mismatch' })
  })

  it('does not authorize a client-provided role, email, metadata, or demo session', () => {
    expect(evaluateCorporateAuthorization({
      ...baseInput,
      binding: { role: 'diretor', email: 'attacker@example.com', isDemo: false },
      preapproval: { ...baseInput.preapproval, role: 'diretor' },
      profile: { ...baseInput.profile, role: 'diretor' },
    })).toEqual({ status: 'denied', reason: 'binding_identity_mismatch' })
  })
})
