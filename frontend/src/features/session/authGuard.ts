import type { DemoSession } from './types'

type MsalAccountLike = { homeAccountId?: string } | null

export function hasAuthenticatedSession(session: Pick<DemoSession, 'authProvider' | 'isDemo'> | null, account: MsalAccountLike) {
  void account
  return session?.isDemo === true || session?.authProvider === 'microsoft'
}
