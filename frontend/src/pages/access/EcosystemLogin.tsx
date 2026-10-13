import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { InteractionStatus } from '@azure/msal-browser'
import { useMsal } from '@azure/msal-react'
import { BrandMark } from '../../shared/ui/BrandMark'
import { ThemeToggle } from '../../app/layouts/ThemeToggle'
import { getEcosystemModulePath, type EcosystemModule } from './ecosystemModules'
import { loginRequest } from '../../config/authConfig'
import { useSession } from '../../features/session/useSession'

const banco2Url = import.meta.env.VITE_BANCO_HORAS_2_URL || getEcosystemModulePath('BANCO_2')

export function EcosystemLogin() {
  const navigate = useNavigate()
  const { instance, inProgress, accounts } = useMsal()
  const { session } = useSession()
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAccess(module: EcosystemModule) {
    if (isAuthenticating || inProgress !== InteractionStatus.None) return
    setError(null)
    setIsAuthenticating(true)

    try {
      const destination = module === 'BANCO_2' ? banco2Url : getEcosystemModulePath('BANCO_1')
      const activeAccount = instance.getActiveAccount() ?? accounts[0]
      if (activeAccount && session?.authProvider === 'microsoft') {
        navigate(destination, { replace: true })
        return
      }
      sessionStorage.setItem('sma:msal-destination', destination)
      if (activeAccount) return
      await instance.loginRedirect(loginRequest)
    } catch (authError) {
      console.error('Erro detalhado do MSAL:', authError)
      setError(authError instanceof Error ? authError.message : 'Não foi possível concluir a autenticação. Tente novamente.')
    } finally {
      setIsAuthenticating(false)
    }
  }

  const busy = isAuthenticating || inProgress !== InteractionStatus.None
  const buttonLabel = busy ? 'Processando autenticação...' : 'Acessar Banco'

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
            <button type="button" disabled={busy} onClick={() => void handleAccess('BANCO_2')} className="ui-button-secondary mt-6 w-full disabled:cursor-not-allowed disabled:opacity-60">
              {busy ? buttonLabel : 'Acessar Banco 2'}
            </button>
          </article>
        </div>

        {error && <p role="alert" className="mx-auto mt-6 max-w-xl text-sm font-semibold text-red-700">{error}</p>}
        <button type="button" onClick={() => navigate('/selecao-perfil')} className="ui-button-secondary mx-auto mt-6">Acessar modo demonstrativo</button>
      </section>
    </main>
  )
}
