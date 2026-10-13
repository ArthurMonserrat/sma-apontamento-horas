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
  const accountId = activeAccount?.homeAccountId ?? null

  useEffect(() => {
    if (session?.authProvider === 'microsoft') return
    console.log('[Auth] Iniciando sincronização', { inProgress, hasActiveAccount: !!accountId })
    if (inProgress !== InteractionStatus.None) return
    if (!accountId || !activeAccount) {
      syncingAccount.current = null
      markAuthReady?.()
      return
    }
    const account = activeAccount
    if (syncingAccount.current === accountId) return

    syncingAccount.current = accountId
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
        markAuthReady?.()
      } catch (error) {
        console.error('[AuthSync] Falha ao sincronizar MSAL com o BFF:', error)
        syncingAccount.current = null
        markAuthReady?.(error instanceof Error ? error.message : 'Não foi possível validar a sessão corporativa.')
      } finally {
        setIsProvisioning(false)
      }
    }

    void synchronize()
  }, [inProgress, accountId])

  // Navega apenas depois que o provider publicou a sessão Microsoft.
  useEffect(() => {
    console.log('[Auth Router] Sessão atual:', session?.authProvider)
    if (session?.authProvider !== 'microsoft') return

    const destination = sessionStorage.getItem('sma:msal-destination')
    console.log('[Auth Router] Destino no storage:', destination)
    if (!destination) return

    console.log('[Auth Router] Disparando navigate para:', destination)
    sessionStorage.removeItem('sma:msal-destination')
    navigate(destination, { replace: true })
  }, [navigate, session?.authProvider])

  if (session?.authProvider === 'microsoft') return children

  // Cobre também o primeiro render, antes de o efeito iniciar o provisionamento.
  const awaitingProvision = (isAuthenticated || !!activeAccount) && !authError
  if (inProgress !== InteractionStatus.None || isProvisioning || awaitingProvision) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-background)] px-4 text-[var(--color-text)]" aria-busy="true">
        <p className="font-semibold text-[var(--color-primary)]">Validando sessão corporativa...</p>
      </main>
    )
  }

  return children
}
