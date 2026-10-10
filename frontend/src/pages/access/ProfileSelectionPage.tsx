import { useLocation, useNavigate } from 'react-router-dom'
import { BrandMark } from '../../shared/ui/BrandMark'
import { ThemeToggle } from '../../app/layouts/ThemeToggle'
import { canAccessDemoPath, getDemoHomePath } from '../../features/session/routePolicy'
import type { DemoRole } from '../../features/session/types'
import { useSession } from '../../features/session/useSession'

type AccessProfile = {
  role: DemoRole
  name: string
  description: string
}

const ACCESS_PROFILES: readonly AccessProfile[] = [
  { role: 'COLLABORATOR', name: 'Colaborador', description: 'Apontamentos, saldos, histórico, ausências e perfil.' },
  { role: 'SUPERVISOR', name: 'Supervisão', description: 'Gestão de equipe, aprovações e solicitações.' },
  { role: 'DIRECTOR_ADMIN', name: 'Direção', description: 'Visão macro, relatórios e gerenciamento de equipes.' },
]

export function ProfileSelectionPage() {
  const { signIn } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: unknown } | null)?.from

  const enterProfile = (role: DemoRole) => {
    signIn(role)
    const destination = typeof from === 'string' && canAccessDemoPath(role, from) ? from : getDemoHomePath(role)
    navigate(destination, { replace: true })
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[var(--color-background)] px-4 py-20 text-[var(--color-text)] sm:px-6">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <section className="w-full max-w-6xl" aria-labelledby="profile-selection-title">
        <header className="mx-auto mb-10 flex max-w-2xl flex-col items-center text-center">
          <BrandMark variant="full" className="mb-7" />
          <p className="ui-badge-secondary">Ambiente corporativo</p>
          <h1 id="profile-selection-title" className="mt-4 text-3xl font-extrabold text-[var(--color-primary)] sm:text-4xl">Escolha seu perfil</h1>
          <p className="mt-4 text-sm leading-6 text-[var(--color-text-muted)] sm:text-base">Selecione a área de acesso para continuar no ambiente escolhido.</p>
        </header>
        <div className="grid gap-5 md:grid-cols-3">
          {ACCESS_PROFILES.map((profile) => (
            <article key={profile.name} className="ui-card flex min-h-64 flex-col rounded-2xl p-6">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-secondary)]">Perfil de acesso</p>
              <h2 className="mt-3 text-xl font-extrabold text-[var(--color-text)]">{profile.name}</h2>
              <p className="mt-3 flex-1 text-sm leading-6 text-[var(--color-text-muted)]">{profile.description}</p>
              <button type="button" onClick={() => enterProfile(profile.role)} className="ui-button-primary mt-6 w-full">Entrar como {profile.name}</button>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
