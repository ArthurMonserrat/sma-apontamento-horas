import { useEffect, useRef, type ReactNode } from 'react'
import { InteractionStatus } from '@azure/msal-browser'
import { useIsAuthenticated, useMsal } from '@azure/msal-react'
import { useNavigate } from 'react-router-dom'
import { loginRequest } from '../../config/authConfig'
import { provisionMicrosoftProfile } from './authService'
import { toMicrosoftSessionInput } from '../../pages/access/ecosystemModules'
import { useSession } from '../session/useSession'

/** Mantém a sessão global alinhada após callbacks MSAL e recarregamentos do redirect. */
export function AuthSync({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { instance, accounts, inProgress } = useMsal()
  const isAuthenticated = useIsAuthenticated()
  const { session, authError, signInWithMicrosoft, markAuthReady } = useSession()
  const syncingAccount = useRef<string | null>(null)

  useEffect(() => {
    if (inProgress !== InteractionStatus.None) return
    if (!isAuthenticated) {
      markAuthReady?.()
      return
    }
    const account = instance.getActiveAccount() ?? accounts[0]
    if (session?.authProvider === 'microsoft') {
      const destination = sessionStorage.getItem('sma:msal-destination')
      if (destination) {
        sessionStorage.removeItem('sma:msal-destination')
        navigate(destination, { replace: true })
      }
      return
    }
    if (!account || syncingAccount.current === account.homeAccountId) return

    syncingAccount.current = account.homeAccountId

    async function synchronize() {
      try {
        instance.setActiveAccount(account)
        const token = await instance.acquireTokenSilent({ ...loginRequest, account })
        const profile = await provisionMicrosoftProfile(account.username, account.name || account.username, token.accessToken)
        const role = profile.role === 'diretor' ? 'DIRECTOR_ADMIN' : profile.role === 'supervisor' ? 'SUPERVISOR' : 'COLLABORATOR'
        signInWithMicrosoft?.({ ...toMicrosoftSessionInput(account, role), corporateProfile: profile })
        const destination = sessionStorage.getItem('sma:msal-destination')
        if (destination) {
          sessionStorage.removeItem('sma:msal-destination')
          navigate(destination, { replace: true })
        }
        markAuthReady?.()
      } catch (error) {
        console.error('[AuthSync] Falha ao sincronizar MSAL com o BFF:', error)
        markAuthReady?.(error instanceof Error ? error.message : 'Não foi possível validar a sessão corporativa.')
      }
    }

    void synchronize()
  }, [accounts, inProgress, instance, isAuthenticated, markAuthReady, navigate, session?.authProvider, signInWithMicrosoft])

  if (isAuthenticated && session?.authProvider !== 'microsoft' && !authError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-background)] px-4 text-[var(--color-text)]" aria-busy="true">
        <p className="font-semibold text-[var(--color-primary)]">Validando sessão corporativa...</p>
      </main>
    )
  }

  return children
}
