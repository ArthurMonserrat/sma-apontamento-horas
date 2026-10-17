import type { VercelRequest } from './types.js'

const CORPORATE_AUTHORIZATION_IMPLEMENTED = false

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function headerValue(headers: VercelRequest['headers'], name: string): string | null {
  if (!headers) return null
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase())
  if (!key) return null
  const value = headers[key]
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

/**
 * This remains hard-false during the identity-foundation stages. The environment flag is deliberately
 * only a future contract so a production misconfiguration cannot authorize a
 * profile before Microsoft identity, pre-authorization and provisioning exist.
 */
export function isCorporateAuthorizationReady(_env: Record<string, string | undefined> = process.env): boolean {
  return CORPORATE_AUTHORIZATION_IMPLEMENTED
}

export function isLegacyMsalAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV !== 'production' && env.ENABLE_LEGACY_MSAL === 'true'
}

export function readBearerToken(req: VercelRequest): string | null {
  const authorization = headerValue(req.headers, 'authorization')?.trim() ?? ''
  if (!authorization.toLowerCase().startsWith('bearer ')) return null
  const token = authorization.slice(7).trim()
  return token || null
}

export interface ValidatedMicrosoftIdentity {
  tenantId: string
  objectId: string
  emailVerified: boolean
}

/**
 * Raw Microsoft claims are not a trusted input boundary. The previous helper
 * accepted arbitrary objects and could be misused as if a decoded payload had
 * already passed signature, issuer and audience validation. Keep this symbol
 * for compatibility, but fail closed until the server-side verifier can issue
 * an opaque, internal evidence object.
 */
export function validateMicrosoftIdentity(_claims: unknown, _expectedTenantId: string): ValidatedMicrosoftIdentity | null {
  return null
}
