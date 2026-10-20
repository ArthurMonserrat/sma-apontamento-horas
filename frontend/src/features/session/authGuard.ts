import type { DemoRole, DemoSession } from './types'

const DEMO_ROLES = new Set<DemoRole>(['COLLABORATOR', 'SUPERVISOR', 'DIRECTOR_ADMIN'])
const CORPORATE_ROLE_MAP: Record<string, DemoRole> = {
  colaborador: 'COLLABORATOR',
  supervisor: 'SUPERVISOR',
  diretor: 'DIRECTOR_ADMIN',
}

export function hasAuthenticatedSession(session: DemoSession | null): boolean {
  if (session?.isDemo === true) {
    return session.authProvider === 'demo' || session.authProvider === undefined
  }

  if (session?.authProvider !== 'supabase' || !session.corporateProfile) return false
  const corporate = session.corporateProfile
  const expectedRole = CORPORATE_ROLE_MAP[corporate.role]
  return corporate.active === true
    && Boolean(corporate.id && corporate.email && corporate.full_name)
    && expectedRole !== undefined
    && session.role === expectedRole
    && DEMO_ROLES.has(session.role)
}
