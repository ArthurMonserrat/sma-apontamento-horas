import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { BrandMark } from '../../shared/ui/BrandMark'
import { ThemeToggle } from '../../app/layouts/ThemeToggle'
import { getBanco2Url, getEcosystemModulePath, OAUTH_DESTINATION_KEY, type EcosystemModule } from './ecosystemModules'
import { startCorporateOAuth } from '../../features/auth/infrastructure/supabaseSessionService'
import { useSession } from '../../features/session/useSession'
import { hasAuthenticatedSession } from '../../features/session/authGuard'
import { getDemoHomePath } from '../../features/session/routePolicy'
import { hasModuleAccess } from '../../features/session/moduleAccess'

/** Mesmo logotipo da tela de entrada do Banco 2. */
const loginLogo = `${import.meta.env.BASE_URL}logo.png`

const NO_ACCESS_MESSAGE: Record<EcosystemModule, string> = {
  BANCO_1: 'Seu usuário não tem acesso ao Apontamento 1. Contate a Administração.',
  BANCO_2: 'Seu usuário não tem acesso ao Apontamento 2. Contate a Administração.',
}

type EcosystemLoginProps = {
  /** Injetável em testes; em produção vem de VITE_BANCO_2_URL. */
  banco2Url?: string | null
  /** Injetável em testes; em produção abre o site do Banco 2. */
  openExternal?: (url: string) => void
}

export function EcosystemLogin({ banco2Url = getBanco2Url(), openExternal = (url) => window.location.assign(url) }: EcosystemLoginProps = {}) {
  const { session, isLoading, authError, beginAuthentication, markAuthReady } = useSession()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sessão corporativa já validada pelo BFF: acessos e cargos vêm do servidor, nunca do cliente.
  const corporateProfile = session?.corporateProfile ?? null
  const isSignedIn = Boolean(session)
  const banco1Home = session && hasAuthenticatedSession(session) ? getDemoHomePath(session.role) : null
  const canOpenBanco2 = Boolean(banco2Url) && hasModuleAccess(corporateProfile, 'BANCO_2')
  const requestedModule = searchParams.get('modulo')

  const callbackError = searchParams.get('authError') === 'unauthorized'
    ? 'Não foi possível validar um perfil corporativo ativo. Contate a Administração.'
    : searchParams.get('authError') === 'invalid_callback'
      ? 'Não foi possível validar o retorno da autenticação. Tente novamente.'
      : null
  const returnAccessError = !isLoading && isSignedIn
    ? requestedModule === 'banco1' && !banco1Home
      ? NO_ACCESS_MESSAGE.BANCO_1
      : requestedModule === 'banco2' && banco2Url && !canOpenBanco2
        ? NO_ACCESS_MESSAGE.BANCO_2
        : null
    : null

  // Retorno do OAuth para o Banco 2: com acesso liberado, abre o site do Banco 2.
  const shouldOpenBanco2 = !isLoading && requestedModule === 'banco2' && canOpenBanco2 && banco2Url
  const openedBanco2Ref = useRef(false)
  useEffect(() => {
    if (!shouldOpenBanco2 || !banco2Url || openedBanco2Ref.current) return
    openedBanco2Ref.current = true
    openExternal(banco2Url)
  }, [shouldOpenBanco2, banco2Url, openExternal])

  async function handleAccess(module: EcosystemModule) {
    if (isAuthenticating) return
    setError(null)

    if (isSignedIn) {
      if (module === 'BANCO_1') {
        if (banco1Home) navigate(banco1Home, { replace: true })
        else setError(NO_ACCESS_MESSAGE.BANCO_1)
        return
      }
      if (canOpenBanco2 && banco2Url) openExternal(banco2Url)
      else setError(NO_ACCESS_MESSAGE.BANCO_2)
      return
    }

    if (module === 'BANCO_2' && !banco2Url) {
      setError('O Apontamento 2 ainda não está configurado neste ambiente.')
      return
    }

    beginAuthentication?.()
    setIsAuthenticating(true)
    try {
      sessionStorage.setItem(OAUTH_DESTINATION_KEY, getEcosystemModulePath(module))
      const result = await startCorporateOAuth()
      if (result.error) {
        sessionStorage.removeItem(OAUTH_DESTINATION_KEY)
        markAuthReady?.(result.error.message)
        setError(result.error.message)
      }
    } catch (authFailure) {
      sessionStorage.removeItem(OAUTH_DESTINATION_KEY)
      const message = authFailure instanceof Error ? authFailure.message : 'Não foi possível iniciar a autenticação corporativa.'
      markAuthReady?.(message)
      setError(message)
    } finally {
      setIsAuthenticating(false)
    }
  }

  // Retorno do OAuth (/?modulo=banco1): assim que o perfil é validado, entra na área do cargo no Banco 1.
  if (!isLoading && banco1Home && requestedModule === 'banco1') {
    return <Navigate to={banco1Home} replace />
  }

  if (isLoading || shouldOpenBanco2) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-background)] px-4 text-[var(--color-text)]" aria-busy="true">
        <p className="font-semibold text-[var(--color-primary)]">{shouldOpenBanco2 ? 'Abrindo o Apontamento 2...' : 'Validando sessão corporativa...'}</p>
      </main>
    )
  }

  const busyLabel = 'Processando autenticação...'
  const banco1Blocked = isSignedIn && !banco1Home
  const banco2Blocked = !banco2Url || (isSignedIn && !canOpenBanco2)
  const banco2Label = !banco2Url ? 'Apontamento 2 indisponível' : isSignedIn && !canOpenBanco2 ? 'Sem acesso ao Apontamento 2' : 'Acessar Apontamento 2'
  const message = error || returnAccessError || authError || callbackError

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[var(--color-background)] px-4 py-12 text-[var(--color-text)] sm:px-6">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <section className="w-full max-w-5xl text-center" aria-labelledby="ecosystem-login-title">
        <div className="flex flex-col items-center justify-center gap-3">
          <BrandMark variant="full" src={loginLogo} transparent className="mx-auto" />
          <p className="ui-badge-secondary">Ambiente corporativo</p>
        </div>
        <h1 id="ecosystem-login-title" className="mt-5 text-3xl font-extrabold text-[var(--color-primary)] sm:text-4xl">Ecossistema SM&amp;A</h1>
        <p className="mt-3 text-base text-[var(--color-text-muted)]">Selecione o sistema que deseja acessar</p>

        <div className="mx-auto mt-8 grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
          <article className="ui-card flex flex-col rounded-2xl p-6 text-left">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-primary)] text-2xl text-white" aria-hidden="true">◷</div>
            <h2 className="text-xl font-extrabold text-[var(--color-text)]">Apontamento 1</h2>
            <p className="mt-1 text-sm font-bold text-[var(--color-primary)]">3º e 7º andar</p>
            <p className="mt-3 flex-1 text-sm leading-6 text-[var(--color-text-muted)]">Gestão consolidada de horas e registros da base principal.</p>
            <button type="button" disabled={isAuthenticating || banco1Blocked} onClick={() => void handleAccess('BANCO_1')} className="ui-button-primary mt-6 w-full disabled:cursor-not-allowed disabled:opacity-60">
              {isAuthenticating ? busyLabel : banco1Blocked ? 'Sem acesso ao Apontamento 1' : 'Acessar Apontamento 1'}
            </button>
          </article>

          <article className="ui-card flex flex-col rounded-2xl p-6 text-left">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-secondary)] text-2xl text-white" aria-hidden="true">◈</div>
            <h2 className="text-xl font-extrabold text-[var(--color-text)]">Apontamento 2</h2>
            <p className="mt-1 text-sm font-bold text-[var(--color-secondary)]">1º e 8º andar</p>
            <p className="mt-3 flex-1 text-sm leading-6 text-[var(--color-text-muted)]">Apontamento rápido para equipes externas, modo offline e sincronização.</p>
            <button type="button" disabled={isAuthenticating || banco2Blocked} onClick={() => void handleAccess('BANCO_2')} className={`${banco2Blocked ? 'ui-button-secondary' : 'ui-button-primary'} mt-6 w-full disabled:cursor-not-allowed disabled:opacity-60`}>
              {isAuthenticating ? busyLabel : banco2Label}
            </button>
          </article>
        </div>

        {message && <p role="alert" className="mx-auto mt-6 max-w-xl text-sm font-semibold text-red-700">{message}</p>}
      </section>
    </main>
  )
}
