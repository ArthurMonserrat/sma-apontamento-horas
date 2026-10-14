import type { DemoSession } from './types'

type MsalAccountLike = { homeAccountId?: string } | null

export function hasAuthenticatedSession(session: Pick<DemoSession, 'authProvider' | 'isDemo'> | null, account: MsalAccountLike) {
  void account
  // Local session objects and MSAL accounts are never proof of corporate
  // authorization. Only the explicitly selected demo session is accepted
  // until a server-validated Supabase profile is wired into this guard.
  return session?.isDemo === true && (session.authProvider === 'demo' || session.authProvider === undefined)
}
