import { useMsal } from '@azure/msal-react'
import { useNavigate } from 'react-router-dom'
import { BrandMark } from '../shared/ui/BrandMark'
import { ThemeToggle } from '../app/layouts/ThemeToggle'
import { getDemoHomePath } from '../features/session/routePolicy'
import { useSession } from '../features/session/useSession'

const banco2Url = import.meta.env.VITE_BANCO_HORAS_2_URL || '/selecao-perfil'

export function Portal() {
  const { instance, accounts } = useMsal()
  const { session } = useSession()
  const navigate = useNavigate()
  const account = instance.getActiveAccount() ?? accounts[0]
  const greetingName = account?.name || session?.name || 'Colaborador'

  function openBanco1() {
    navigate(getDemoHomePath(session?.role ?? 'COLLABORATOR'))
  }

  return (
    <main className="relative min-h-screen bg-[var(--color-background)] px-4 py-12 text-[var(--color-text)] sm:px-6">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <section className="mx-auto w-full max-w-5xl text-center">
        <BrandMark variant="full" transparent className="mx-auto mb-8" />
        <p className="ui-badge-secondary">Ecossistema SM&A</p>
        <h1 className="mt-5 text-3xl font-extrabold text-[var(--color-primary)] sm:text-4xl">Olá, {greetingName}</h1>
        <p className="mt-3 text-base text-[var(--color-text-muted)]">Selecione o ambiente que deseja acessar</p>

        <div className="mx-auto mt-8 grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
          <article className="ui-card flex flex-col rounded-2xl p-6 text-left">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-primary)] text-2xl text-white" aria-hidden="true">◷</div>
            <h2 className="text-xl font-extrabold text-[var(--color-text)]">Banco de Horas 1</h2>
            <p className="mt-3 flex-1 text-sm leading-6 text-[var(--color-text-muted)]">Gestão consolidada de horas e registros da base principal.</p>
            <button type="button" onClick={openBanco1} className="ui-button-primary mt-6 w-full">Acessar Banco de Horas 1</button>
          </article>

          <article className="ui-card flex flex-col rounded-2xl p-6 text-left">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-secondary)] text-2xl text-white" aria-hidden="true">◈</div>
            <h2 className="text-xl font-extrabold text-[var(--color-text)]">Banco de Horas 2 - Campo e Estudos</h2>
            <p className="mt-3 flex-1 text-sm leading-6 text-[var(--color-text-muted)]">Apontamento rápido para equipes externas, modo offline e sincronização.</p>
            <a href={banco2Url} className="ui-button-secondary mt-6 w-full text-center">Acessar Banco de Horas 2</a>
          </article>
        </div>
      </section>
    </main>
  )
}
