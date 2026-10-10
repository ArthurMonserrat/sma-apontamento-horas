import { useNavigate, type NavigateFunction } from 'react-router-dom'
import { BrandMark } from '../shared/ui/BrandMark'
import { ThemeToggle } from '../app/layouts/ThemeToggle'
import type { DemoRole } from '../features/session/types'
import { useSession } from '../features/session/useSession'

export type DemoPlaceholderRole = Exclude<DemoRole, 'COLLABORATOR'>

const ROLE_LABELS: Record<DemoPlaceholderRole, string> = {
  SUPERVISOR: 'Supervisor',
  DIRECTOR_ADMIN: 'Diretor/Administração',
}

type DemoAreaPlaceholderContentProps = {
  role: DemoPlaceholderRole
  sessionName: string
  signOut: () => void
  navigate: NavigateFunction
}

export function DemoAreaPlaceholderContent({
  role,
  sessionName,
  signOut,
  navigate,
}: DemoAreaPlaceholderContentProps) {
  const roleLabel = ROLE_LABELS[role]
  const exitDemo = () => {
    signOut()
    navigate('/login', { replace: true })
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[var(--color-background)] px-4 py-20 text-[var(--color-text)] sm:px-6">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <section className="ui-card w-full max-w-2xl rounded-3xl p-7 text-center sm:p-10" aria-labelledby="demo-area-title">
        <BrandMark variant="full" className="mb-7" />
        <p className="ui-badge-secondary">Perfil de acesso: {roleLabel}</p>
        <h1 id="demo-area-title" className="mt-5 text-3xl font-extrabold text-[var(--color-primary)]">
          Área de {roleLabel}
        </h1>
        <p className="mt-4 text-lg font-semibold text-[var(--color-text)]">Esta área está em desenvolvimento.</p>
        <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
          Sessão corporativa ativa para {sessionName}. Nenhuma funcionalidade deste perfil está disponível nesta versão.
        </p>
        <button type="button" onClick={exitDemo} className="ui-button-secondary mt-8">
          Sair do sistema
        </button>
      </section>
    </main>
  )
}

export function DemoAreaPlaceholderPage({ role }: { role: DemoPlaceholderRole }) {
  const { session, signOut } = useSession()
  const navigate = useNavigate()
  const roleLabel = ROLE_LABELS[role]
  const sessionName = session?.role === role ? session.name : roleLabel

  return (
    <DemoAreaPlaceholderContent
      role={role}
      sessionName={sessionName}
      signOut={signOut}
      navigate={navigate}
    />
  )
}
