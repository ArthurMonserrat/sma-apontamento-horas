import { Link, useLocation } from 'react-router-dom'
import { NavigationIcon, type NavigationIconName } from '../../shared/ui/NavigationIcon'

type DirectorSidebarProps = {
  onSignOut: () => void
}

type NavigationItem = {
  label: string
  icon: NavigationIconName
  to: string
  matches: (pathname: string, search: string) => boolean
  tourClassName?: string
}

const navigationItems: NavigationItem[] = [
  { label: 'Painel Diretor', icon: 'dashboard', to: '/administracao', matches: (pathname, search) => pathname === '/administracao' && !new URLSearchParams(search).has('view'), tourClassName: 'tour-painel-diretor' },
  { label: 'Equipes', icon: 'users', to: '/administracao/equipes', matches: (pathname) => pathname === '/administracao/equipes' },
  { label: 'Relatórios', icon: 'bar-chart', to: '/administracao/relatorios', matches: (pathname) => pathname === '/administracao/relatorios', tourClassName: 'tour-relatorios' },
  { label: 'Avisos', icon: 'bell', to: '/administracao?view=avisos', matches: (pathname, search) => pathname === '/administracao' && new URLSearchParams(search).get('view') === 'avisos' },
]

export function DirectorSidebar({ onSignOut }: DirectorSidebarProps) {
  const { pathname, search } = useLocation()

  return (
    <aside className="hidden h-[calc(100vh-5rem)] w-64 shrink-0 flex-col bg-[var(--color-sidebar)] text-[var(--color-sidebar-text)] lg:sticky lg:top-20 lg:flex lg:self-start">
      <section className="border-b border-[var(--color-sidebar-border)] p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] text-sm font-extrabold">DI</span>
          <div>
            <p className="text-sm font-extrabold leading-tight">Diretoria SM&A</p>
            <p className="mt-0.5 text-xs leading-tight text-[var(--color-sidebar-text-muted)]">Visão macro</p>
          </div>
        </div>
      </section>
      <nav className="flex-1 space-y-2 p-4" aria-label="Menu lateral da diretoria">
        {navigationItems.map((item) => {
          const isActive = item.matches(pathname, search)
          const iconClassName = isActive
            ? 'bg-[var(--color-navigation-active-detail)] text-[var(--color-primary)]'
            : 'bg-[var(--color-sidebar-surface)]'
          const linkClassName = isActive
            ? 'border-[var(--color-primary)] bg-[var(--color-navigation-active)] text-[var(--color-navigation-active-text)]'
            : 'border-transparent text-[var(--color-sidebar-text-muted)] hover:bg-[var(--color-navigation-hover)] hover:text-[var(--color-sidebar-text)]'

          return (
            <Link key={item.to} to={item.to} aria-current={isActive ? 'page' : undefined} className={`flex w-full items-center gap-3 rounded-xl border-l-4 px-3 py-3 text-left text-sm font-semibold transition ${linkClassName} ${item.tourClassName ?? ''}`}>
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconClassName}`}><NavigationIcon name={item.icon} /></span>
              <span className="flex-1">{item.label}</span>
              {isActive && <span className="text-[10px] font-extrabold uppercase">Atual</span>}
            </Link>
          )
        })}
      </nav>
      <div className="border-t border-[var(--color-sidebar-border)] p-4">
        <button type="button" onClick={onSignOut} className="w-full rounded-xl border border-[var(--color-sidebar-border)] px-4 py-3 text-left text-sm font-bold text-[var(--color-sidebar-text)] hover:bg-[var(--color-navigation-hover)]">
          Sair do sistema
        </button>
      </div>
    </aside>
  )
}
