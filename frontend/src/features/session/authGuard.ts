import type { DemoSession } from './types'

type MsalAccountLike = { homeAccountId?: string } | null

export function hasAuthenticatedSession(session: Pick<DemoSession, 'authProvider' | 'isDemo' | 'corporateProfile'> | null, account: MsalAccountLike) {
  void account
  if (session?.isDemo === true && (session.authProvider === 'demo' || session.authProvider === undefined)) return true
  // A Supabase session is accepted only after the server has returned an
  // active corporate profile. A token, localStorage object or MSAL account by
  // itself never satisfies this predicate.
  return session?.isDemo === false
    && session.authProvider === 'supabase'
    && Boolean(session.corporateProfile?.id && session.corporateProfile.active)
}
