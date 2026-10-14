import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BrandMark } from '../../shared/ui/BrandMark'
import { ThemeToggle } from '../../app/layouts/ThemeToggle'
import { getEcosystemModulePath, OAUTH_DESTINATION_KEY, type EcosystemModule } from './ecosystemModules'
import { startCorporateOAuth } from '../../features/auth/infrastructure/supabaseSessionService'
import { useSession } from '../../features/session/useSession'

export function EcosystemLogin() {
  const { isLoading, authError } = useSession()
  const [searchParams] = useSearchParams()
  const callbackError = searchParams.get('authError') === 'unauthorized'
    ? 'Acesso corporativo não autorizado. Solicite sua pré-autorização à Administração.'
    : searchParams.get('authError') === 'invalid_callback'
      ? 'Não foi possível validar o retorno da autenticação. Tente novamente.'
      : null
  const { beginAuthentication, markAuthReady } = useSession()
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAccess(module: EcosystemModule) {
    if (isAuthenticating) return
    setError(null)
    beginAuthentication?.()
    setIsAuthenticating(true)

    try {
      const destination = getEcosystemModulePath(module)
      if (!destination) {
        setError('O Banco de Horas 2 ainda não está configurado neste ambiente.')
        return
      }
      sessionStorage.setItem(OAUTH_DESTINATION_KEY, destination)
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

  const busy = isAuthenticating
  const buttonLabel = busy ? 'Processando autenticação...' : 'Acessar Banco'

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-background)] px-4 text-[var(--color-text)]" aria-busy="true">
        <p className="font-semibold text-[var(--color-primary)]">Validando sessão corporativa...</p>
      </main>
    )
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[var(--color-background)] px-4 py-12 text-[var(--color-text)] sm:px-6">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <section className="w-full max-w-5xl text-center" aria-labelledby="ecosystem-login-title">
        <div className="flex flex-col items-center justify-center gap-3">
          <BrandMark variant="full" transparent className="mx-auto" />
          <p className="ui-badge-secondary">Ambiente corporativo</p>
        </div>
        <h1 id="ecosystem-login-title" className="mt-5 text-3xl font-extrabold text-[var(--color-primary)] sm:text-4xl">Ecossistema SM&amp;A</h1>
        <p className="mt-3 text-base text-[var(--color-text-muted)]">Selecione o sistema que deseja acessar</p>

        <div className="mx-auto mt-8 grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
          <article className="ui-card flex flex-col rounded-2xl p-6 text-left">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-primary)] text-2xl text-white" aria-hidden="true">◷</div>
            <h2 className="text-xl font-extrabold text-[var(--color-text)]">Banco de Horas 1</h2>
            <p className="mt-3 flex-1 text-sm leading-6 text-[var(--color-text-muted)]">Gestão consolidada de horas e registros da base principal.</p>
            <button type="button" disabled={busy} onClick={() => void handleAccess('BANCO_1')} className="ui-button-primary mt-6 w-full disabled:cursor-not-allowed disabled:opacity-60">
              {busy ? buttonLabel : 'Acessar Banco 1'}
            </button>
          </article>

          <article className="ui-card flex flex-col rounded-2xl p-6 text-left">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-secondary)] text-2xl text-white" aria-hidden="true">◈</div>
            <h2 className="text-xl font-extrabold text-[var(--color-text)]">Banco de Horas 2 (Campo e Estudos)</h2>
            <p className="mt-3 flex-1 text-sm leading-6 text-[var(--color-text-muted)]">Apontamento rápido para equipes externas, modo offline e sincronização.</p>
            <button type="button" disabled className="ui-button-secondary mt-6 w-full cursor-not-allowed opacity-60">
              Banco 2 indisponível
            </button>
          </article>
        </div>

        {(error || authError || callbackError) && <p role="alert" className="mx-auto mt-6 max-w-xl text-sm font-semibold text-red-700">{error || authError || callbackError}</p>}
      </section>
    </main>
  )
}
