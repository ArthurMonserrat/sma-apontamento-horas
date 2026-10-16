export type CorporateRole = 'colaborador' | 'supervisor' | 'diretor'

export type TrustedMicrosoftIdentity = {
  tenantId: string
  objectId: string
  emailVerified: boolean
  source: 'entra-provider-verified'
}

export type TrustedMicrosoftIdentityInput = {
  source?: unknown
  cryptographicallyVerified?: unknown
  tenantId?: unknown
  objectId?: unknown
  emailVerified?: unknown
}

export type AccessPreapproval = {
  email: string
  fullName: string
  role: CorporateRole
  active: boolean
  microsoftTenantId: string | null
  microsoftObjectId: string | null
}

export type AuthorizationDecision =
  | { status: 'authorized'; role: CorporateRole; email: string; fullName: string }
  | { status: 'unauthorized'; reason: 'identity_missing' | 'identity_mismatch' | 'preapproval_not_found' | 'preapproval_inactive' | 'preapproval_identity_missing' }

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Validates the server-side envelope produced by a future Entra/Supabase
 * adapter. This function deliberately does not decode JWTs or infer claims.
 * The cryptographic verification and provider binding must happen before this
 * boundary; unverified frontend payloads are rejected.
 */
export function validateTrustedMicrosoftIdentity(input: unknown, expectedTenantId: string): TrustedMicrosoftIdentity | null {
  if (!input || typeof input !== 'object' || !nonEmpty(expectedTenantId)) return null
  const candidate = input as TrustedMicrosoftIdentityInput
  if (candidate.source !== 'entra-provider-verified' || candidate.cryptographicallyVerified !== true) return null
  if (!nonEmpty(candidate.tenantId) || !nonEmpty(candidate.objectId)) return null
  if (candidate.tenantId.trim() !== expectedTenantId.trim()) return null
  if (candidate.emailVerified !== true) return null

  return {
    tenantId: candidate.tenantId.trim(),
    objectId: candidate.objectId.trim(),
    emailVerified: true,
    source: 'entra-provider-verified',
  }
}

export function authorizeWithPreapproval(
  identity: TrustedMicrosoftIdentity | null,
  preapproval: AccessPreapproval | null,
): AuthorizationDecision {
  if (!identity) return { status: 'unauthorized', reason: 'identity_missing' }
  if (!preapproval) return { status: 'unauthorized', reason: 'preapproval_not_found' }
  if (!preapproval.active) return { status: 'unauthorized', reason: 'preapproval_inactive' }
  if (!preapproval.microsoftTenantId || !preapproval.microsoftObjectId) {
    return { status: 'unauthorized', reason: 'preapproval_identity_missing' }
  }
  if (preapproval.microsoftTenantId !== identity.tenantId || preapproval.microsoftObjectId !== identity.objectId) {
    return { status: 'unauthorized', reason: 'identity_mismatch' }
  }

  return {
    status: 'authorized',
    role: preapproval.role,
    email: preapproval.email,
    fullName: preapproval.fullName,
  }
}
