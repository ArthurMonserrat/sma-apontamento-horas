import type { CollaboratorProfile } from '../profile/types'
import type { CorporateProfile, DemoSession } from './types'

/**
 * Resolves the actor id used by domain operations without mixing demo data
 * into a corporate session. A corporate id is usable only when it came from
 * the server-authorized CorporateProfile already attached to the session.
 */
export function resolveSessionActorId(input: {
  session: DemoSession | null
  profile: CollaboratorProfile | null
  corporateProfile?: CorporateProfile | null
}): string | null {
  if (input.session?.authProvider === 'supabase') {
    const corporateProfile = input.corporateProfile
    return corporateProfile?.active && corporateProfile.id.trim() ? corporateProfile.id : null
  }

  return input.profile?.active && input.profile.id.trim() ? input.profile.id : null
}

export function isCorporateSession(session: DemoSession | null): boolean {
  return session?.authProvider === 'supabase' && !session.isDemo
}

export function localDataAccessError(session: DemoSession | null): string | null {
  return isCorporateSession(session)
    ? 'Dados demonstrativos não estão disponíveis para a sessão corporativa.'
    : null
}
