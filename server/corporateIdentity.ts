export type CorporateRole = 'colaborador' | 'supervisor' | 'diretor'

const trustedIdentityMarker = Symbol('trusted-microsoft-identity')

export type TrustedMicrosoftIdentity = {
  tenantId: string
  objectId: string
  emailVerified: boolean
  source: 'entra-provider-verified'
  readonly [trustedIdentityMarker]: true
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
  | { status: 'unauthorized'; reason: 'identity_missing' | 'identity_untrusted' | 'identity_mismatch' | 'preapproval_not_found' | 'preapproval_inactive' | 'preapproval_identity_missing' }

/**
 * Boundary for a future Entra/Supabase adapter. This function deliberately
 * does not decode JWTs, infer claims, or treat booleans/strings supplied by a
 * caller as proof. A provider verifier must be added in this server module to
 * issue the private marker after validating signature, issuer, audience,
 * tenant, object ID and the binding to the same Supabase user. Until then,
 * every external envelope is rejected.
 */
export function validateTrustedMicrosoftIdentity(input: unknown, expectedTenantId: string): TrustedMicrosoftIdentity | null {
  void input
  void expectedTenantId
  return null
}

export function authorizeWithPreapproval(
  identity: unknown,
  preapproval: AccessPreapproval | null,
): AuthorizationDecision {
  if (!identity) return { status: 'unauthorized', reason: 'identity_missing' }
  if (typeof identity !== 'object' || !(trustedIdentityMarker in identity)) {
    return { status: 'unauthorized', reason: 'identity_untrusted' }
  }
  const trustedIdentity = identity as TrustedMicrosoftIdentity
  if (!preapproval) return { status: 'unauthorized', reason: 'preapproval_not_found' }
  if (!preapproval.active) return { status: 'unauthorized', reason: 'preapproval_inactive' }
  if (!preapproval.microsoftTenantId || !preapproval.microsoftObjectId) {
    return { status: 'unauthorized', reason: 'preapproval_identity_missing' }
  }
  if (preapproval.microsoftTenantId !== trustedIdentity.tenantId || preapproval.microsoftObjectId !== trustedIdentity.objectId) {
    return { status: 'unauthorized', reason: 'identity_mismatch' }
  }

  return {
    status: 'authorized',
    role: preapproval.role,
    email: preapproval.email,
    fullName: preapproval.fullName,
  }
}
