import type { DemoRole, DemoSession } from './types'

const HOME_PATH_BY_ROLE: Record<DemoRole, string> = {
  COLLABORATOR: '/colaborador',
  SUPERVISOR: '/supervisor',
  DIRECTOR_ADMIN: '/administracao',
}

const POLICY_ORIGIN = 'https://demo-session.invalid'

function toAbsoluteInternalPath(path: string) {
  const normalized = path.trim()
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

type DemoRouteLocation = {
  pathname: string
  search: string
  hash: string
}

export type DemoRouteRedirect = {
  to: string
  state?: { from: string }
}

function getSafePathname(path: string) {
  if (!path.startsWith('/') || path.startsWith('//')) return null
  const rawPathname = path.split(/[?#]/, 1)[0]
  if (rawPathname.includes('\\') || /%(?:2f|5c)/i.test(rawPathname)) return null

  try {
    const normalized = new URL(path, POLICY_ORIGIN)
    if (normalized.origin !== POLICY_ORIGIN || normalized.pathname !== rawPathname) return null
    return normalized.pathname
  } catch {
    return null
  }
}

export function getDemoHomePath(role: DemoRole) {
  return toAbsoluteInternalPath(HOME_PATH_BY_ROLE[role])
}

export function canAccessDemoPath(role: DemoRole, path: string) {
  const pathname = getSafePathname(path)
  if (!pathname) return false
  if (pathname === '/portal') return true
  if (pathname === '/avisos') return role === 'SUPERVISOR' || role === 'DIRECTOR_ADMIN'
  const homePath = getDemoHomePath(role)
  return pathname === homePath || pathname.startsWith(`${homePath}/`)
}

export function resolveProtectedDemoRoute(
  session: DemoSession | null,
  allowedRoles: readonly DemoRole[],
  location: DemoRouteLocation,
): DemoRouteRedirect | null {
  const currentPath = `${location.pathname}${location.search}${location.hash}`
  if (!session) return { to: '/login', state: { from: currentPath } }
  if (!allowedRoles.includes(session.role) || !canAccessDemoPath(session.role, currentPath)) {
    return { to: getDemoHomePath(session.role) }
  }
  return null
}

export function resolvePublicOnlyDemoRoute(
  session: DemoSession | null,
  from: unknown,
): DemoRouteRedirect | null {
  if (!session) return null
  return {
    to: typeof from === 'string' && canAccessDemoPath(session.role, from)
      ? from
      : session.authProvider === 'microsoft' ? '/' : getDemoHomePath(session.role),
  }
}
