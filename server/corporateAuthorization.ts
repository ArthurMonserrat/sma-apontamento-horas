import { isVerifiedEntraBinding, type EntraBindingResult } from './entraIdentityVerifier.js'
import type { AccessPreapproval, CorporateRole } from './corporateIdentity.js'

const trustedFactsMarker = Symbol('trusted-corporate-authorization-facts')

export type CorporateProfileAuthorizationRecord = {
  id: string
  authUserId: string | null
  role: CorporateRole
  active: boolean
}

export type CorporateSessionAuthorizationInput = {
  session: { userId: string; identityUserId: string } | null
  binding: EntraBindingResult | unknown
  preapproval: AccessPreapproval | null
  profile: CorporateProfileAuthorizationRecord | null
}

export type TrustedCorporateAuthorizationFacts = CorporateSessionAuthorizationInput & {
  readonly [trustedFactsMarker]: true
}

export type CorporateAuthorizationDecision =
  | { status: 'authorized'; profileId: string; authUserId: string; role: CorporateRole }
  | {
      status: 'denied'
      reason:
        | 'session_missing'
        | 'session_identity_mismatch'
        | 'facts_unavailable'
        | 'binding_unavailable'
        | 'binding_identity_mismatch'
        | 'preapproval_missing'
        | 'preapproval_inactive'
        | 'preapproval_identity_missing'
        | 'preapproval_identity_mismatch'
        | 'profile_missing'
        | 'profile_inactive'
        | 'profile_identity_mismatch'
        | 'profile_role_mismatch'
    }

function isRole(value: unknown): value is CorporateRole {
  return value === 'colaborador' || value === 'supervisor' || value === 'diretor'
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object')
}

/**
 * Internal server-adapter boundary. Only code that has already obtained the
 * session, identity, pre-authorization and profile from trusted server-side
 * sources may call this constructor. It deliberately is not used by any HTTP
 * handler and must never receive request body/query data.
 */
export function createTrustedCorporateAuthorizationFacts(input: unknown): TrustedCorporateAuthorizationFacts | null {
  if (!isRecord(input)) return null
  // The factory is not a trust boundary by itself. It may only wrap a bundle
  // that already contains the opaque binding emitted by the server verifier;
  // browser-shaped objects, decoded claims and request bodies are rejected.
  if (!isVerifiedEntraBinding(input.binding)) return null
  return Object.freeze({
    ...input,
    [trustedFactsMarker]: true as const,
  }) as TrustedCorporateAuthorizationFacts
}

function isTrustedCorporateAuthorizationFacts(value: unknown): value is TrustedCorporateAuthorizationFacts {
  if (!isRecord(value)) return false
  const candidate = value as Record<PropertyKey, unknown>
  return candidate[trustedFactsMarker] === true
}

/**
 * Evaluates server-side facts only. No request body, email, metadata, local
 * storage value or demo session is accepted as an authorization input.
 *
 * The only successful binding is the opaque result emitted by the server-side
 * Entra verifier. The current verifier has no producer for that result until
 * the provider-subject mapping is homologated, so this evaluator remains
 * fail-closed in the deployed application.
 */
export function evaluateCorporateAuthorization(
  input: unknown,
  now = Math.floor(Date.now() / 1000),
): CorporateAuthorizationDecision {
  if (!isTrustedCorporateAuthorizationFacts(input)) {
    return { status: 'denied', reason: 'facts_unavailable' }
  }
  if (!input || !input.session || !isNonEmptyString(input.session.userId) || !isNonEmptyString(input.session.identityUserId)) {
    return { status: 'denied', reason: 'session_missing' }
  }
  if (input.session.userId !== input.session.identityUserId) {
    return { status: 'denied', reason: 'session_identity_mismatch' }
  }

  const preapproval = input.preapproval
  if (!preapproval) return { status: 'denied', reason: 'preapproval_missing' }
  if (!preapproval.active) return { status: 'denied', reason: 'preapproval_inactive' }
  if (!preapproval.microsoftTenantId || !preapproval.microsoftObjectId || !isRole(preapproval.role)) {
    return { status: 'denied', reason: 'preapproval_identity_missing' }
  }

  const profile = input.profile
  if (!profile) return { status: 'denied', reason: 'profile_missing' }
  if (!profile.active) return { status: 'denied', reason: 'profile_inactive' }
  if (!isNonEmptyString(profile.id) || profile.authUserId !== input.session.userId) {
    return { status: 'denied', reason: 'profile_identity_mismatch' }
  }
  if (!isRole(profile.role) || profile.role !== preapproval.role) {
    return { status: 'denied', reason: 'profile_role_mismatch' }
  }

  if (isRecord(input.binding) && input.binding.supabaseUserId !== input.session.userId) {
    return { status: 'denied', reason: 'binding_identity_mismatch' }
  }
  if (!isVerifiedEntraBinding(input.binding, now)) {
    return { status: 'denied', reason: 'binding_unavailable' }
  }
  if (input.binding.supabaseUserId !== input.session.userId) {
    return { status: 'denied', reason: 'binding_identity_mismatch' }
  }
  if (input.binding.tenantId !== preapproval.microsoftTenantId || input.binding.objectId !== preapproval.microsoftObjectId) {
    return { status: 'denied', reason: 'preapproval_identity_mismatch' }
  }

  return {
    status: 'authorized',
    profileId: profile.id,
    authUserId: input.session.userId,
    role: profile.role,
  }
}
