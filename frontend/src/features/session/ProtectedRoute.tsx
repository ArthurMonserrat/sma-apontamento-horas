import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { msalInstance } from '../../config/authConfig'
import { hasAuthenticatedSession } from './authGuard'
import { resolveProtectedDemoRoute } from './routePolicy'
import type { DemoRole } from './types'
import { useSession } from './useSession'

const COLLABORATOR_ONLY: readonly DemoRole[] = ['COLLABORATOR']

type ProtectedRouteProps = {
  children: ReactNode
  allowedRoles?: readonly DemoRole[]
}

export function ProtectedRoute({ children, allowedRoles = COLLABORATOR_ONLY }: ProtectedRouteProps) {
  const { session, isLoading } = useSession()
  const location = useLocation()
  const account = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0] ?? null

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center ui-surface-subtle" aria-busy="true">
        <p className="font-semibold ui-heading">Carregando ambiente corporativo...</p>
      </main>
    )
  }

  if (!hasAuthenticatedSession(session, account)) {
    return <Navigate to="/" replace />
  }

  if (!session) {
    const canEnterBeforeProfileSelection = location.pathname === '/selecao-perfil' || location.pathname === '/portal'
    return canEnterBeforeProfileSelection ? children : <Navigate to="/" replace />
  }

  const redirect = resolveProtectedDemoRoute(session, allowedRoles, location)
  if (redirect) return <Navigate to={redirect.to} replace state={redirect.state} />
  return children
}
