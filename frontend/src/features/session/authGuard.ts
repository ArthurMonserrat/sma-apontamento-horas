import type { DemoSession } from './types'

type MsalAccountLike = { homeAccountId?: string } | null

export function hasAuthenticatedSession(session: Pick<DemoSession, 'authProvider'> | null, account: MsalAccountLike) {
  return Boolean(account?.homeAccountId) || session?.authProvider === 'microsoft'
}
