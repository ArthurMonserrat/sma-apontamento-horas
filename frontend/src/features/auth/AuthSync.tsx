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
  const { session, signInWithMicrosoft, markAuthReady } = useSession()
  const syncingAccount = useRef<string | null>(null)

  useEffect(() => {
    if (inProgress !== InteractionStatus.None) return
    if (!isAuthenticated) {
      markAuthReady?.()
      return
    }
    const account = instance.getActiveAccount() ?? accounts[0]
    if (!account || session?.authProvider === 'microsoft' || syncingAccount.current === account.homeAccountId) {
      markAuthReady?.()
      return
    }

    syncingAccount.current = account.homeAccountId
    let cancelled = false

    async function synchronize() {
      try {
        instance.setActiveAccount(account)
        const token = await instance.acquireTokenSilent({ ...loginRequest, account })
        const profile = await provisionMicrosoftProfile(account.username, account.name || account.username, token.accessToken)
        if (cancelled) return
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
        syncingAccount.current = null
        markAuthReady?.(error instanceof Error ? error.message : 'Não foi possível validar a sessão corporativa.')
      }
    }

    void synchronize()
    return () => { cancelled = true }
  }, [accounts, inProgress, instance, isAuthenticated, markAuthReady, navigate, session?.authProvider, signInWithMicrosoft])

  return children
}
