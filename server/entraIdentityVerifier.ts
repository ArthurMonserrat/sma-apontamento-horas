/**
 * Server-side boundary between a Supabase session and Microsoft Entra claims.
 *
 * Supabase's auth.identities row proves that an Azure identity is linked to a
 * Supabase user, but provider_id/identity_data alone do not prove the Entra
 * tenant and object ID. A future adapter in this module must verify a real
 * Microsoft token (signature/JWKS, issuer, audience, expiry and nonce when
 * applicable) and explicitly bind its result to the server-side identity row
 * before it can issue the private evidence marker below.
 */

const verifiedClaimsMarker = Symbol('verified-microsoft-claims')

export type SupabaseAzureIdentityRecord = {
  identityId: string
  userId: string
  provider: string
  providerId: string
  identityData: unknown
}

export type EntraBindingInput = {
  supabaseUserId: string
  identities: readonly SupabaseAzureIdentityRecord[]
  microsoftEvidence: unknown
}

export type EntraBindingConfig = {
  expectedTenantId: string
}

export type EntraBindingResult =
  | { status: 'verified'; tenantId: string; objectId: string; supabaseUserId: string }
  | { status: 'invalid'; reason: 'invalid_input' | 'azure_identity_missing' | 'multiple_azure_identities' | 'identity_user_mismatch' | 'tenant_mismatch' | 'object_id_missing' | 'identity_record_mismatch' }
  | { status: 'unavailable'; reason: 'verified_provider_evidence_missing' }

type VerifiedMicrosoftClaims = {
  identityRecordId: string
  subject: string
  issuer: string
  audience: string
  tenantId: string
  objectId: string
  expiresAt: number
  readonly [verifiedClaimsMarker]: true
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isVerifiedMicrosoftClaims(value: unknown): value is VerifiedMicrosoftClaims {
  if (!value || typeof value !== 'object' || !(verifiedClaimsMarker in value)) return false
  const claims = value as Record<PropertyKey, unknown>
  return claims[verifiedClaimsMarker] === true
    && nonEmptyString(claims.identityRecordId)
    && nonEmptyString(claims.subject)
    && nonEmptyString(claims.issuer)
    && nonEmptyString(claims.audience)
    && nonEmptyString(claims.tenantId)
    && nonEmptyString(claims.objectId)
    && typeof claims.expiresAt === 'number'
    && Number.isFinite(claims.expiresAt)
    && claims.expiresAt > Math.floor(Date.now() / 1000)
}

/**
 * Resolves only an already verified server-side Microsoft evidence object.
 * This function intentionally returns `unavailable` for all browser-shaped
 * claims until the real Entra token verifier is implemented and configured.
 */
export function verifySupabaseAzureBinding(
  input: unknown,
  config: unknown,
): EntraBindingResult {
  if (!input || typeof input !== 'object' || !config || typeof config !== 'object') {
    return { status: 'invalid', reason: 'invalid_input' }
  }
  const inputRecord = input as Record<string, unknown>
  const configRecord = config as Record<string, unknown>
  if (!nonEmptyString(inputRecord.supabaseUserId) || !Array.isArray(inputRecord.identities) || !nonEmptyString(configRecord.expectedTenantId)) {
    return { status: 'invalid', reason: 'invalid_input' }
  }

  const azureIdentities = inputRecord.identities.filter((identity): identity is SupabaseAzureIdentityRecord => (
    Boolean(identity && typeof identity === 'object' && (identity as Record<string, unknown>).provider === 'azure')
  ))
  if (azureIdentities.length === 0) return { status: 'invalid', reason: 'azure_identity_missing' }
  if (azureIdentities.length > 1) return { status: 'invalid', reason: 'multiple_azure_identities' }

  const [azureIdentity] = azureIdentities
  if (!nonEmptyString(azureIdentity.identityId) || !nonEmptyString(azureIdentity.userId) || azureIdentity.userId !== inputRecord.supabaseUserId) {
    return { status: 'invalid', reason: 'identity_user_mismatch' }
  }

  // provider_id and identity_data are deliberately not accepted as proof of
  // tid/oid. The provider verifier must issue opaque evidence server-side and
  // bind it to this exact auth.identities row by identity record ID. No
  // equivalence between provider_id, sub and oid is assumed.
  if (!isVerifiedMicrosoftClaims(inputRecord.microsoftEvidence)) {
    return { status: 'unavailable', reason: 'verified_provider_evidence_missing' }
  }

  const claims = inputRecord.microsoftEvidence
  if (claims.tenantId !== configRecord.expectedTenantId) return { status: 'invalid', reason: 'tenant_mismatch' }
  if (!nonEmptyString(claims.objectId)) return { status: 'invalid', reason: 'object_id_missing' }
  if (claims.identityRecordId !== azureIdentity.identityId) return { status: 'invalid', reason: 'identity_record_mismatch' }

  return {
    status: 'verified',
    tenantId: claims.tenantId,
    objectId: claims.objectId,
    supabaseUserId: inputRecord.supabaseUserId as string,
  }
}
