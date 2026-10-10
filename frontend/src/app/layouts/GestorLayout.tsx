import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { BrandMark } from '../../shared/ui/BrandMark'
import { ThemeToggle } from './ThemeToggle'
import { useSession } from '../../features/session/useSession'
import { NavigationIcon } from '../../shared/ui/NavigationIcon'

export function GestorLayout() {
  const [isMenuOpen, setMenuOpen] = useState(false)
  const { session, signOut } = useSession()
  const navigate = useNavigate()
  const sessionRole = session?.role ?? null
  const isDirector = sessionRole === 'DIRECTOR_ADMIN'
  const displayName = session?.name ?? 'Usuário gestor'

  function exit() {
    signOut()
    navigate('/login', { replace: true })
  }

  const linkClass = ({ isActive }: { isActive: boolean }) => `flex items-center gap-3 rounded-xl border-l-4 px-3 py-3 text-left text-sm font-semibold transition ${isActive ? 'border-[var(--color-primary)] bg-[var(--color-navigation-active)] text-[var(--color-navigation-active-text)]' : 'border-transparent text-[var(--color-sidebar-text-muted)] hover:bg-[var(--color-navigation-hover)] hover:text-[var(--color-sidebar-text)]'}`

  return (
    <div className="min-h-screen overflow-x-clip bg-[var(--color-background)] text-[var(--color-text)]">
      <header className="sticky top-0 z-40 flex h-20 w-full items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-header)] px-4 shadow-sm sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={() => setMenuOpen((current) => !current)} className="rounded-lg border border-[var(--color-border)] p-2 text-[var(--color-primary)] transition hover:bg-[var(--color-surface-subtle)] md:hidden" aria-label={isMenuOpen ? 'Fechar navegação lateral' : 'Abrir navegação lateral'} aria-controls="manager-mobile-navigation" aria-expanded={isMenuOpen}>
            <span aria-hidden="true">☰</span>
          </button>
          <BrandMark variant="compact" />
          <div className="hidden min-w-0 sm:block">
            <p className="ui-eyebrow text-xs font-bold uppercase tracking-[0.2em]">Área da {isDirector ? 'diretoria' : 'supervisão'}</p>
            <p className="truncate text-sm text-[var(--color-text-muted)]">Central de comunicação da operação</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-right text-xs font-semibold text-[var(--color-text-muted)] sm:block">{displayName}</span>
          <ThemeToggle />
        </div>
      </header>

      <div className="relative grid min-h-[calc(100vh-5rem)] min-w-0 grid-cols-1 md:grid-cols-[16rem_minmax(0,1fr)]">
        <aside id="manager-mobile-navigation" className={`${isMenuOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'} fixed bottom-0 left-0 top-20 z-30 flex w-72 min-w-0 flex-col overflow-y-auto bg-[var(--color-sidebar)] text-[var(--color-sidebar-text)] shadow-2xl transition-[translate,visibility] duration-200 md:visible md:static md:translate-x-0 md:z-auto md:h-[calc(100vh-5rem)] md:w-64 md:shadow-none`} aria-label="Menu lateral da gestão">
          <section className="border-b border-[var(--color-sidebar-border)] p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] text-sm font-extrabold">{isDirector ? 'DI' : 'SU'}</span>
              <div className="min-w-0">
                <p className="text-sm font-extrabold leading-tight">{displayName}</p>
                <p className="mt-0.5 text-xs leading-tight text-[var(--color-sidebar-text-muted)]">{isDirector ? 'Diretoria' : 'Supervisor'}</p>
              </div>
            </div>
          </section>
          <nav className="flex-1 space-y-2 p-4" aria-label="Navegação da gestão">
            <NavLink to={isDirector ? '/administracao' : '/supervisor'} end onClick={() => setMenuOpen(false)} className={linkClass}>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-sidebar-surface)]"><NavigationIcon name={isDirector ? 'dashboard' : 'users'} /></span>
              <span className="flex-1">{isDirector ? 'Painel Diretor' : 'Gestão da Equipe'}</span>
            </NavLink>
            {isDirector && <NavLink to="/administracao/equipes" onClick={() => setMenuOpen(false)} className={linkClass}><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-sidebar-surface)]"><NavigationIcon name="users" /></span><span className="flex-1">Equipes</span></NavLink>}
            {isDirector && <NavLink to="/administracao/relatorios" onClick={() => setMenuOpen(false)} className={linkClass}><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-sidebar-surface)]"><NavigationIcon name="bar-chart" /></span><span className="flex-1">Relatórios</span></NavLink>}
            <NavLink to="/avisos" onClick={() => setMenuOpen(false)} className={linkClass}><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-navigation-active-detail)] text-[var(--color-primary)]"><NavigationIcon name="bell" /></span><span className="flex-1">Avisos</span></NavLink>
          </nav>
          <div className="border-t border-[var(--color-sidebar-border)] p-4">
            <button type="button" onClick={exit} className="w-full rounded-xl border border-[var(--color-sidebar-border)] px-4 py-3 text-left text-sm font-bold text-[var(--color-sidebar-text)] hover:bg-[var(--color-navigation-hover)]">Sair do sistema</button>
          </div>
        </aside>
        <main className="w-full min-w-0 overflow-x-hidden" id="main-content"><Outlet /></main>
        {isMenuOpen && <button type="button" className="fixed inset-x-0 bottom-0 top-20 z-20 bg-[var(--color-overlay)] md:hidden" onClick={() => setMenuOpen(false)} aria-label="Fechar navegação" />}
      </div>
    </div>
  )
}
