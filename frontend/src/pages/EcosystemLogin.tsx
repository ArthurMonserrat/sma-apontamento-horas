import { useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useNavigate } from 'react-router-dom'
import { loginRequest } from '../config/msalConfig'
import { BrandMark } from '../components/BrandMark'
import { ThemeToggle } from '../components/ThemeToggle'
import { getEcosystemModulePath, type EcosystemModule } from './ecosystemModules'

const banco2Url = import.meta.env.VITE_BANCO_HORAS_2_URL || getEcosystemModulePath('BANCO_2')

export function EcosystemLogin() {
  const { instance, accounts, inProgress } = useMsal()
  const navigate = useNavigate()
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function getActiveAccount() {
    const activeAccount = instance.getActiveAccount() ?? accounts[0]
    if (activeAccount && !instance.getActiveAccount()) instance.setActiveAccount(activeAccount)
    return activeAccount
  }

  async function handleAccess(module: EcosystemModule) {
    if (isAuthenticating || inProgress !== 'none') return
    setError(null)
    setIsAuthenticating(true)

    try {
      const account = getActiveAccount() ?? (await instance.loginPopup(loginRequest)).account
      if (!account) throw new Error('A autenticação não retornou uma conta válida.')
      instance.setActiveAccount(account)

      const destination = module === 'BANCO_2' ? banco2Url : getEcosystemModulePath('BANCO_1')
      if (/^https?:\/\//i.test(destination)) {
        window.location.assign(destination)
      } else {
        navigate(destination, { replace: true })
      }
    } catch (authError) {
      console.error('[MSAL] Não foi possível autenticar para acessar o módulo.', authError)
      setError('Não foi possível concluir a autenticação. Tente novamente.')
    } finally {
      setIsAuthenticating(false)
    }
  }

  const busy = isAuthenticating || inProgress !== 'none'

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[var(--color-background)] px-4 py-12 text-[var(--color-text)] sm:px-6">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <section className="w-full max-w-5xl text-center" aria-labelledby="ecosystem-login-title">
        <BrandMark variant="full" transparent className="mx-auto mb-8" />
        <p className="ui-badge-secondary">Ambiente corporativo</p>
        <h1 id="ecosystem-login-title" className="mt-5 text-3xl font-extrabold text-[var(--color-primary)] sm:text-4xl">Ecossistema SM&amp;A</h1>
        <p className="mt-3 text-base text-[var(--color-text-muted)]">Selecione o sistema que deseja acessar</p>

        <div className="mx-auto mt-8 grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
          <article className="ui-card flex flex-col rounded-2xl p-6 text-left">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-primary)] text-2xl text-white" aria-hidden="true">◷</div>
            <h2 className="text-xl font-extrabold text-[var(--color-text)]">Banco de Horas 1</h2>
            <p className="mt-3 flex-1 text-sm leading-6 text-[var(--color-text-muted)]">Gestão consolidada de horas e registros da base principal.</p>
            <button type="button" disabled={busy} onClick={() => void handleAccess('BANCO_1')} className="ui-button-primary mt-6 w-full disabled:cursor-not-allowed disabled:opacity-60">
              {busy ? 'Autenticando...' : 'Acessar Banco de Horas 1'}
            </button>
          </article>

          <article className="ui-card flex flex-col rounded-2xl p-6 text-left">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-secondary)] text-2xl text-white" aria-hidden="true">◈</div>
            <h2 className="text-xl font-extrabold text-[var(--color-text)]">Banco de Horas 2 (Campo e Estudos)</h2>
            <p className="mt-3 flex-1 text-sm leading-6 text-[var(--color-text-muted)]">Apontamento rápido para equipes externas, modo offline e sincronização.</p>
            <button type="button" disabled={busy} onClick={() => void handleAccess('BANCO_2')} className="ui-button-secondary mt-6 w-full disabled:cursor-not-allowed disabled:opacity-60">
              {busy ? 'Autenticando...' : 'Acessar Banco de Horas 2'}
            </button>
          </article>
        </div>

        {error && <p role="alert" className="mx-auto mt-6 max-w-xl text-sm font-semibold text-red-700">{error}</p>}
      </section>
    </main>
  )
}
