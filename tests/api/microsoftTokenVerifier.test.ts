import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet, type JSONWebKeySet, type KeyLike } from 'jose'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  assessSupabaseIdentityBinding,
  verifyMicrosoftIdToken,
  type MicrosoftTokenVerifierConfig,
} from '../../server/microsoftTokenVerifier.js'

const tenantId = '11111111-1111-1111-1111-111111111111'
const objectId = '33333333-3333-3333-3333-333333333333'
const audience = '22222222-2222-2222-2222-222222222222'
const issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`
const jwksUri = `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`
const nonce = 'synthetic-nonce'

let privateKey: KeyLike
let localJwks: ReturnType<typeof createLocalJWKSet>

const config: MicrosoftTokenVerifierConfig = {
  expectedTenantId: tenantId,
  expectedIssuer: issuer,
  expectedAudience: audience,
  jwksUri,
  expectedNonce: nonce,
  clockToleranceSeconds: 0,
}

type TokenOptions = {
  issuer?: string
  audience?: string
  nonce?: string
  issuedAt?: number
  expiresAt?: number | string
}

async function createToken(
  overrides: Record<string, unknown> = {},
  key = privateKey,
  options: TokenOptions = {},
): Promise<string> {
  return new SignJWT({
    tid: tenantId,
    oid: objectId,
    sub: 'synthetic-subject',
    xms_edov: true,
    nonce: options.nonce ?? nonce,
    ...overrides,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'synthetic-key', typ: 'JWT' })
    .setIssuer(options.issuer ?? issuer)
    .setAudience(options.audience ?? audience)
    .setIssuedAt(options.issuedAt)
    .setExpirationTime(options.expiresAt ?? '10m')
    .sign(key)
}

beforeAll(async () => {
  const generated = await generateKeyPair('RS256')
  privateKey = generated.privateKey
  const publicJwk = await exportJWK(generated.publicKey)
  const jwks: JSONWebKeySet = { keys: [{ ...publicJwk, kid: 'synthetic-key', alg: 'RS256', use: 'sig' }] }
  localJwks = createLocalJWKSet(jwks)
})

describe('Microsoft Entra token verifier', () => {
  it('accepts a synthetically signed ID token with the expected tenant and audience', async () => {
    const result = await verifyMicrosoftIdToken(await createToken(), config, { keyResolver: localJwks })

    expect(result).toMatchObject({
      status: 'verified-token',
      tenantId,
      objectId,
      subject: 'synthetic-subject',
      issuer,
      audience,
    })
  })

  it('rejects an invalid signature instead of trusting decoded claims', async () => {
    const other = await generateKeyPair('RS256')
    const token = await createToken({}, other.privateKey)

    await expect(verifyMicrosoftIdToken(token, config, { keyResolver: localJwks })).resolves.toMatchObject({
      status: 'invalid',
      reason: 'signature_or_claims_invalid',
    })
  })

  it.each([
    ['wrong audience', {}, { audience: '44444444-4444-4444-4444-444444444444' }],
    ['wrong issuer', {}, { issuer: 'https://login.microsoftonline.com/other/v2.0' }],
    ['wrong tenant', { tid: '55555555-5555-5555-5555-555555555555' }],
    ['missing object id', { oid: undefined }],
    ['unverified email domain', { xms_edov: false }],
  ])('rejects %s', async (_label, overrides, options) => {
    const token = await createToken(overrides, privateKey, options)
    await expect(verifyMicrosoftIdToken(token, config, { keyResolver: localJwks })).resolves.toMatchObject({ status: 'invalid' })
  })

  it('rejects an expired token, a future token and a nonce mismatch', async () => {
    const expired = await createToken({}, privateKey, { issuedAt: 1, expiresAt: 2 })
    const future = await createToken({ nbf: Math.floor(Date.now() / 1000) + 600 })
    const nonceMismatch = await createToken({}, privateKey, { nonce: 'actual-nonce' })
    const mismatchConfig = { ...config, expectedNonce: 'different-nonce' }

    await expect(verifyMicrosoftIdToken(expired, config, { keyResolver: localJwks })).resolves.toMatchObject({ status: 'invalid' })
    await expect(verifyMicrosoftIdToken(future, config, { keyResolver: localJwks })).resolves.toMatchObject({ status: 'invalid' })
    await expect(verifyMicrosoftIdToken(nonceMismatch, mismatchConfig, { keyResolver: localJwks })).resolves.toMatchObject({ status: 'invalid' })
  })

  it('rejects a token intended for another resource and unsafe JWKS configuration', async () => {
    const token = await createToken()
    const unsafeConfig = { ...config, jwksUri: 'https://attacker.example/jwks.json' }
    const nonCanonicalMicrosoftPath = { ...config, jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/not-keys` }
    const wrongResource = { ...config, expectedAudience: '44444444-4444-4444-4444-444444444444' }

    await expect(verifyMicrosoftIdToken(token, unsafeConfig, { keyResolver: localJwks })).resolves.toMatchObject({ status: 'invalid', reason: 'invalid_configuration' })
    await expect(verifyMicrosoftIdToken(token, nonCanonicalMicrosoftPath, { keyResolver: localJwks })).resolves.toMatchObject({ status: 'invalid', reason: 'invalid_configuration' })
    await expect(verifyMicrosoftIdToken(token, wrongResource, { keyResolver: localJwks })).resolves.toMatchObject({ status: 'invalid' })
  })

  it('rejects previously verified evidence after the token expires', async () => {
    vi.useFakeTimers()
    try {
      const evidence = await verifyMicrosoftIdToken(await createToken({}, privateKey, { expiresAt: '10m' }), config, { keyResolver: localJwks })
      expect(evidence.status).toBe('verified-token')

      vi.advanceTimersByTime(11 * 60 * 1000)

      expect(assessSupabaseIdentityBinding(evidence, 'supabase-user-a', {
        identityId: 'identity-a',
        userId: 'supabase-user-a',
        provider: 'azure',
      })).toEqual({ status: 'invalid', reason: 'token_evidence_missing' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the Supabase binding unavailable until provider subject mapping is proven', async () => {
    const evidence = await verifyMicrosoftIdToken(await createToken(), config, { keyResolver: localJwks })
    const binding = assessSupabaseIdentityBinding(evidence, 'supabase-user-a', {
      identityId: 'identity-a',
      userId: 'supabase-user-a',
      provider: 'azure',
      providerId: 'provider-subject-with-unconfirmed-semantics',
    })

    expect(binding).toEqual({ status: 'unavailable', reason: 'provider_subject_mapping_unconfirmed' })
  })

  it('rejects a Supabase identity record belonging to another user', async () => {
    const evidence = await verifyMicrosoftIdToken(await createToken(), config, { keyResolver: localJwks })
    expect(assessSupabaseIdentityBinding(evidence, 'supabase-user-a', {
      identityId: 'identity-a',
      userId: 'supabase-user-b',
      provider: 'azure',
    })).toEqual({ status: 'invalid', reason: 'identity_user_mismatch' })
  })

  it('rejects a non-Azure identity record even when the session user matches', async () => {
    const evidence = await verifyMicrosoftIdToken(await createToken(), config, { keyResolver: localJwks })
    expect(assessSupabaseIdentityBinding(evidence, 'supabase-user-a', {
      identityId: 'identity-a',
      userId: 'supabase-user-a',
      provider: 'email',
    })).toEqual({ status: 'invalid', reason: 'identity_provider_mismatch' })
  })

  it('rejects an object that merely claims to be cryptographically verified', () => {
    expect(assessSupabaseIdentityBinding({
      status: 'verified-token',
      tenantId,
      objectId,
      subject: 'forged',
      issuer,
      audience,
      expiresAt: Math.floor(Date.now() / 1000) + 600,
      cryptographicallyVerified: true,
    }, 'supabase-user-a', {
      identityId: 'identity-a',
      userId: 'supabase-user-a',
      provider: 'azure',
    })).toEqual({ status: 'invalid', reason: 'token_evidence_missing' })
  })
})
