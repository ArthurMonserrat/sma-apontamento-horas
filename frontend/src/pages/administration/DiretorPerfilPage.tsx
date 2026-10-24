import { useNavigate } from 'react-router-dom'
import { BrandMark } from '../../shared/ui/BrandMark'
import { DirectorSidebar } from '../../app/layouts/DirectorSidebar'
import { ThemeToggle } from '../../app/layouts/ThemeToggle'
import { useSession } from '../../features/session/useSession'
import { useCorporateIdentity } from '../../features/profile/useCorporateIdentity'
import { CorporateIdentityPanel } from '../../features/profile/CorporateIdentityPanel'

export function DiretorPerfilPage() {
  const { session, signOut } = useSession()
  const navigate = useNavigate()
  const identity = useCorporateIdentity()
  const exit = () => { void signOut(); navigate('/login', { replace: true }) }

  return (
    <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-text)]">
      <header className="sticky top-0 z-40 flex h-20 w-full items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-header)] px-4 shadow-sm sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <BrandMark variant="compact" />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-secondary)]">SM&A - Meu perfil</p>
            <p className="text-sm text-[var(--color-text-muted)]">Dados da sua conta corporativa</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-right text-xs font-semibold text-[var(--color-text-muted)] sm:block">{identity?.fullName ?? session?.name}</span>
          <ThemeToggle />
        </div>
      </header>
      <div className="flex">
        <DirectorSidebar onSignOut={exit} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl space-y-6">
            <section>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-secondary)]">Conta</p>
              <h1 className="mt-2 text-3xl font-extrabold">Meu perfil</h1>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">Informações preenchidas automaticamente a partir do seu login Microsoft.</p>
            </section>
            {identity ? <CorporateIdentityPanel identity={identity} /> : (
              <p role="alert" className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-sm font-semibold">
                Não foi possível carregar o perfil corporativo. Saia e entre novamente.
              </p>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
