import { useEffect, useRef, useState, type ReactNode } from 'react'
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
  const [isProvisioning, setIsProvisioning] = useState(false)
  const activeAccount = instance.getActiveAccount() ?? accounts[0]

  useEffect(() => {
    console.log('[Auth] Iniciando sincronização', { inProgress, hasActiveAccount: !!activeAccount })
    if (inProgress !== InteractionStatus.None) return
    if (!activeAccount) {
      syncingAccount.current = null
      markAuthReady?.()
      return
    }
    const account = activeAccount
    if (session?.authProvider === 'microsoft') {
      const destination = sessionStorage.getItem('sma:msal-destination')
      if (destination) {
        console.log('[Auth] Redirecionando para:', destination)
        sessionStorage.removeItem('sma:msal-destination')
        navigate(destination, { replace: true })
      }
      return
    }
    if (!account || syncingAccount.current === account.homeAccountId) return

    syncingAccount.current = account.homeAccountId
    setIsProvisioning(true)

    async function synchronize() {
      try {
        instance.setActiveAccount(account)
        const token = await instance.acquireTokenSilent({ ...loginRequest, account })
        console.log('[Auth] Chamando /api/provision')
        const profile = await provisionMicrosoftProfile(account.username, account.name || account.username, token.accessToken)
        console.log('[Auth] API retornou com sucesso', profile)
        const role = profile.role === 'diretor' ? 'DIRECTOR_ADMIN' : profile.role === 'supervisor' ? 'SUPERVISOR' : 'COLLABORATOR'
        signInWithMicrosoft?.({ ...toMicrosoftSessionInput(account, role), corporateProfile: profile })
        const destination = sessionStorage.getItem('sma:msal-destination')
        if (destination) {
          console.log('[Auth] Redirecionando para:', destination)
          sessionStorage.removeItem('sma:msal-destination')
          navigate(destination, { replace: true })
        }
        markAuthReady?.()
      } catch (error) {
        console.error('[AuthSync] Falha ao sincronizar MSAL com o BFF:', error)
        markAuthReady?.(error instanceof Error ? error.message : 'Não foi possível validar a sessão corporativa.')
      } finally {
        setIsProvisioning(false)
      }
    }

    void synchronize()
  }, [activeAccount, inProgress, instance, markAuthReady, navigate, session?.authProvider, signInWithMicrosoft])

  // Cobre também o primeiro render, antes de o efeito iniciar o provisionamento.
  const awaitingProvision = (isAuthenticated || !!activeAccount) && session?.authProvider !== 'microsoft' && !authError
  if (inProgress !== InteractionStatus.None || isProvisioning || awaitingProvision) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-background)] px-4 text-[var(--color-text)]" aria-busy="true">
        <p className="font-semibold text-[var(--color-primary)]">Validando sessão corporativa...</p>
      </main>
    )
  }

  return children
}
