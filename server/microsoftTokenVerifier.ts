import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
} from 'jose'

const verifiedTokenMarker = Symbol('verified-microsoft-id-token')

export type MicrosoftTokenVerifierConfig = {
  expectedTenantId: string
  expectedIssuer: string
  expectedAudience: string
  jwksUri: string
  expectedNonce?: string
  clockToleranceSeconds?: number
}

export type MicrosoftTokenEvidence = {
  status: 'verified-token'
  tenantId: string
  objectId: string
  subject: string
  issuer: string
  audience: string
  expiresAt: number
  readonly [verifiedTokenMarker]: true
}

export type MicrosoftTokenVerification = MicrosoftTokenEvidence | {
  status: 'invalid'
  reason: 'invalid_input' | 'invalid_configuration' | 'signature_or_claims_invalid' | 'tenant_mismatch' | 'object_id_invalid' | 'email_domain_unverified'
}

export type SupabaseIdentityBindingAssessment =
  | { status: 'invalid'; reason: 'token_evidence_missing' | 'identity_record_missing' | 'identity_user_mismatch' | 'identity_provider_mismatch' }
  | { status: 'unavailable'; reason: 'provider_subject_mapping_unconfirmed' }

export type SupabaseAzureIdentityBindingRecord = {
  identityId: string
  userId: string
  provider: string
}

type VerifyOptions = {
  keyResolver?: ReturnType<typeof createRemoteJWKSet>
}

const remoteJwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isGuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function isValidConfiguration(config: MicrosoftTokenVerifierConfig): boolean {
  if (!isGuid(config.expectedTenantId) || !nonEmptyString(config.expectedAudience) || !nonEmptyString(config.expectedIssuer) || !nonEmptyString(config.jwksUri)) return false
  if (config.expectedNonce !== undefined && !nonEmptyString(config.expectedNonce)) return false

  try {
    const issuer = new URL(config.expectedIssuer)
    const jwks = new URL(config.jwksUri)
    const expectedIssuer = `https://login.microsoftonline.com/${config.expectedTenantId}/v2.0`
    const expectedJwksUri = `https://login.microsoftonline.com/${config.expectedTenantId}/discovery/v2.0/keys`

    return issuer.protocol === 'https:'
      && issuer.hostname === 'login.microsoftonline.com'
      && issuer.pathname === `/${config.expectedTenantId}/v2.0`
      && config.expectedIssuer === expectedIssuer
      && jwks.protocol === 'https:'
      && jwks.hostname === 'login.microsoftonline.com'
      && config.jwksUri === expectedJwksUri
      && jwks.pathname === `/${config.expectedTenantId}/discovery/v2.0/keys`
      && (config.clockToleranceSeconds === undefined || Number.isInteger(config.clockToleranceSeconds) && config.clockToleranceSeconds >= 0 && config.clockToleranceSeconds <= 300)
  } catch {
    return false
  }
}

function getRemoteKeyResolver(uri: string): ReturnType<typeof createRemoteJWKSet> {
  const previous = remoteJwks.get(uri)
  if (previous) return previous
  const resolver = createRemoteJWKSet(new URL(uri))
  remoteJwks.set(uri, resolver)
  return resolver
}

function claimsHaveExpectedIdentity(payload: JWTPayload, config: MicrosoftTokenVerifierConfig): MicrosoftTokenVerification | null {
  if (payload.tid !== config.expectedTenantId) return { status: 'invalid', reason: 'tenant_mismatch' }
  if (!isGuid(payload.oid)) return { status: 'invalid', reason: 'object_id_invalid' }
  if (!nonEmptyString(payload.sub)) return { status: 'invalid', reason: 'signature_or_claims_invalid' }
  if (payload.xms_edov !== undefined && payload.xms_edov !== true && payload.xms_edov !== '1') {
    return { status: 'invalid', reason: 'email_domain_unverified' }
  }
  return null
}

/**
 * Verifies a Microsoft Entra ID token in a server-only boundary.
 *
 * This deliberately returns token evidence, not a corporate identity or role.
 * The caller must still establish the binding to the same Supabase Auth user
 * and identity row before any future authorization can use it.
 */
export async function verifyMicrosoftIdToken(
  token: unknown,
  config: MicrosoftTokenVerifierConfig,
  options: VerifyOptions = {},
): Promise<MicrosoftTokenVerification> {
  if (!nonEmptyString(token) || !config || typeof config !== 'object' || !isValidConfiguration(config)) {
    return { status: 'invalid', reason: 'invalid_configuration' }
  }

  const keyResolver = options.keyResolver ?? getRemoteKeyResolver(config.jwksUri)
  try {
    const verified = await jwtVerify(token, keyResolver, {
      algorithms: ['RS256'],
      audience: config.expectedAudience,
      issuer: config.expectedIssuer,
      clockTolerance: config.clockToleranceSeconds ?? 60,
    })
    if (verified.protectedHeader.alg !== 'RS256' || (verified.protectedHeader.typ !== undefined && verified.protectedHeader.typ !== 'JWT')) {
      return { status: 'invalid', reason: 'signature_or_claims_invalid' }
    }

    const identityError = claimsHaveExpectedIdentity(verified.payload, config)
    if (identityError) return identityError
    if (verified.payload.iss !== config.expectedIssuer || typeof verified.payload.aud !== 'string' || verified.payload.aud !== config.expectedAudience) {
      return { status: 'invalid', reason: 'signature_or_claims_invalid' }
    }
    if (config.expectedNonce !== undefined && verified.payload.nonce !== config.expectedNonce) {
      return { status: 'invalid', reason: 'signature_or_claims_invalid' }
    }
    if (!Number.isInteger(verified.payload.exp)) return { status: 'invalid', reason: 'signature_or_claims_invalid' }

    return Object.freeze({
      status: 'verified-token',
      tenantId: verified.payload.tid as string,
      objectId: verified.payload.oid as string,
      subject: verified.payload.sub as string,
      issuer: verified.payload.iss as string,
      audience: verified.payload.aud as string,
      expiresAt: verified.payload.exp as number,
      [verifiedTokenMarker]: true as const,
    })
  } catch {
    return { status: 'invalid', reason: 'signature_or_claims_invalid' }
  }
}

function isMicrosoftTokenEvidence(value: unknown): value is MicrosoftTokenEvidence {
  if (!value || typeof value !== 'object' || !(verifiedTokenMarker in value)) return false
  const evidence = value as Record<PropertyKey, unknown>
  return evidence[verifiedTokenMarker] === true
    && evidence.status === 'verified-token'
    && isGuid(evidence.tenantId)
    && isGuid(evidence.objectId)
    && nonEmptyString(evidence.subject)
    && nonEmptyString(evidence.issuer)
    && nonEmptyString(evidence.audience)
    && Number.isInteger(evidence.expiresAt)
    && Number(evidence.expiresAt) > Math.floor(Date.now() / 1000)
}

/**
 * Assesses the missing Supabase binding without treating provider_id as oid/sub.
 * A server adapter must supply the provider's documented subject mapping before
 * this can become a verified corporate identity. No authorization is produced.
 */
export function assessSupabaseIdentityBinding(
  evidence: unknown,
  sessionUserId: unknown,
  identityRecord: unknown,
): SupabaseIdentityBindingAssessment {
  if (!isMicrosoftTokenEvidence(evidence)) return { status: 'invalid', reason: 'token_evidence_missing' }
  if (!nonEmptyString(sessionUserId) || !identityRecord || typeof identityRecord !== 'object') return { status: 'invalid', reason: 'identity_record_missing' }
  const identity = identityRecord as Partial<SupabaseAzureIdentityBindingRecord>
  if (!nonEmptyString(identity.identityId)) return { status: 'invalid', reason: 'identity_record_missing' }
  if (identity.userId !== sessionUserId) return { status: 'invalid', reason: 'identity_user_mismatch' }
  if (identity.provider !== 'azure') return { status: 'invalid', reason: 'identity_provider_mismatch' }
  return { status: 'unavailable', reason: 'provider_subject_mapping_unconfirmed' }
}
