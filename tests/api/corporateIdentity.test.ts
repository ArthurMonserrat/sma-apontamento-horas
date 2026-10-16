import { describe, expect, it } from 'vitest'
import {
  authorizeWithPreapproval,
  validateTrustedMicrosoftIdentity,
  type AccessPreapproval,
} from '../../server/corporateIdentity.js'

const validIdentity = {
  source: 'entra-provider-verified' as const,
  cryptographicallyVerified: true as const,
  tenantId: 'tenant-1',
  objectId: 'object-1',
  emailVerified: true,
}

const activeApproval: AccessPreapproval = {
  email: 'person@example.com',
  fullName: 'Person Example',
  role: 'diretor',
  active: true,
  microsoftTenantId: 'tenant-1',
  microsoftObjectId: 'object-1',
}

describe('corporate identity foundation', () => {
  it('requires a verified provider source and the expected tenant/object identifiers', () => {
    expect(validateTrustedMicrosoftIdentity(validIdentity, 'tenant-1')).toEqual({
      tenantId: 'tenant-1',
      objectId: 'object-1',
      emailVerified: true,
      source: 'entra-provider-verified',
    })
    expect(validateTrustedMicrosoftIdentity({ ...validIdentity, source: 'frontend' }, 'tenant-1')).toBeNull()
    expect(validateTrustedMicrosoftIdentity({ ...validIdentity, cryptographicallyVerified: false }, 'tenant-1')).toBeNull()
    expect(validateTrustedMicrosoftIdentity({ ...validIdentity, tenantId: 'other' }, 'tenant-1')).toBeNull()
    expect(validateTrustedMicrosoftIdentity({ ...validIdentity, objectId: '' }, 'tenant-1')).toBeNull()
  })

  it('does not authorize an email match without Microsoft identifiers', () => {
    expect(authorizeWithPreapproval(validIdentity, { ...activeApproval, microsoftTenantId: null, microsoftObjectId: null })).toEqual({
      status: 'unauthorized',
      reason: 'preapproval_identity_missing',
    })
  })

  it('uses the active preapproval role only when both identities match', () => {
    expect(authorizeWithPreapproval(validIdentity, activeApproval)).toEqual({
      status: 'authorized',
      role: 'diretor',
      email: 'person@example.com',
      fullName: 'Person Example',
    })
    expect(authorizeWithPreapproval(validIdentity, { ...activeApproval, active: false })).toEqual({
      status: 'unauthorized',
      reason: 'preapproval_inactive',
    })
    expect(authorizeWithPreapproval({ ...validIdentity, objectId: 'other' }, activeApproval)).toEqual({
      status: 'unauthorized',
      reason: 'identity_mismatch',
    })
  })

  it('never accepts a frontend role or defaults an unknown identity to collaborator', () => {
    const forged = { ...activeApproval, role: 'diretor' as const, frontendRole: 'colaborador' }
    expect(authorizeWithPreapproval(validIdentity, forged)).toMatchObject({ status: 'authorized', role: 'diretor' })
    expect(authorizeWithPreapproval(validIdentity, null)).toEqual({ status: 'unauthorized', reason: 'preapproval_not_found' })
  })
})
