import type { KeyboardEventHandler } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { collaboratorNavigation } from '../../mocks/navigation'
import { useSession } from '../../features/session/useSession'
import { profileService } from '../../services/profileService'
import { InstallAppButton } from '../../shared/ui/InstallAppButton'
import { NavigationIcon } from '../../shared/ui/NavigationIcon'

type SidebarContentProps = {
  onNavigate: () => void
}

type MobileDrawerProps = {
  isOpen: boolean
  onClose: () => void
  onNavigate: () => void
  onKeyDown: KeyboardEventHandler<HTMLElement>
}

function getInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase('pt-BR')
}

function SidebarContent({ onNavigate }: SidebarContentProps) {
  const { profile, signOut } = useSession()
  const navigate = useNavigate()
  const assignment = profile ? profileService.resolveAssignment(profile.id) : null

  const handleSignOut = () => {
    signOut()
    onNavigate()
    navigate('/login', { replace: true })
  }

  return (
    <>
      {profile && (
        <section className="border-b border-[var(--color-sidebar-border)] p-4" aria-label="Perfil atual do colaborador">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-surface)] text-sm font-extrabold" aria-label={`Iniciais de ${profile.name}`}>{getInitials(profile.name)}</span>
            <div className="min-w-0">
              <p className="text-sm font-extrabold leading-tight">{profile.name}</p>
              <p className="mt-0.5 text-xs leading-tight text-[var(--color-sidebar-text-muted)]">{profile.jobTitle}</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-[var(--color-sidebar-surface)] p-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-sidebar-text-muted)]">Squad ativa</p>
              <p className="text-xs font-bold leading-tight">{assignment?.squadName ?? 'Não definida'}</p>
            </div>
          </div>
        </section>
      )}

      <nav className="tour-menu flex-1 space-y-2 p-4" aria-label="Navegação do colaborador">
        {collaboratorNavigation.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/colaborador'}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl border-l-4 px-3 py-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-sidebar-text)] ${item.path === '/colaborador/apontamentos/novo' ? 'tour-btn-apontar' : ''} ${
                isActive ? 'border-[var(--color-primary)] bg-[var(--color-navigation-active)] text-[var(--color-navigation-active-text)]' : 'border-transparent text-[var(--color-sidebar-text-muted)] hover:bg-[var(--color-navigation-hover)] hover:text-[var(--color-sidebar-text)]'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${isActive ? 'bg-[var(--color-navigation-active-detail)] text-[var(--color-primary)]' : 'bg-[var(--color-sidebar-surface)]'}`}><NavigationIcon name={item.icon} /></span>
                <span className={`flex-1 ${item.path === '/colaborador/avisos' ? 'tour-avisos' : ''}`}>{item.label}</span>
                {isActive && <span className="text-[10px] font-extrabold uppercase" aria-label="Página atual">Atual</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-[var(--color-sidebar-border)] p-4">
        <InstallAppButton />
        <button type="button" onClick={handleSignOut} className="mt-3 w-full rounded-xl border border-[var(--color-sidebar-border)] px-4 py-3 text-left text-sm font-bold text-[var(--color-sidebar-text)] hover:bg-[var(--color-navigation-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-sidebar-text)]">
          Sair do sistema
        </button>
        <p className="mt-3 px-1 text-xs text-[var(--color-sidebar-text-muted)]">Dados armazenados somente neste navegador.</p>
      </div>
    </>
  )
}

export function DesktopSidebar() {
  return (
    <aside
      data-desktop-sidebar
      aria-label="Menu lateral do colaborador"
      className="hidden h-[calc(100vh-5rem)] w-64 min-w-0 flex-col overflow-y-auto bg-[var(--color-sidebar)] text-[var(--color-sidebar-text)] md:sticky md:top-20 md:flex md:self-start"
    >
      <SidebarContent onNavigate={() => undefined} />
    </aside>
  )
}

export function MobileDrawer({ isOpen, onClose, onNavigate, onKeyDown }: MobileDrawerProps) {
  return (
    <aside
      id="collaborator-mobile-navigation"
      data-mobile-drawer
      data-drawer-panel
      onKeyDown={onKeyDown}
      aria-label="Menu móvel do colaborador"
      className={`${isOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'} fixed bottom-0 left-0 top-20 z-30 flex w-72 min-w-0 flex-col overflow-y-auto bg-[var(--color-sidebar)] text-[var(--color-sidebar-text)] shadow-2xl transition-[translate,visibility] duration-200 md:hidden`}
    >
      <div className="flex items-center justify-between border-b border-[var(--color-sidebar-border)] px-4 py-3">
        <p className="font-bold">Navegação</p>
        <button type="button" onClick={onClose} data-drawer-initial-focus className="rounded-lg border border-[var(--color-sidebar-border)] px-3 py-2 text-sm font-bold hover:bg-[var(--color-navigation-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-sidebar-text)]" aria-label="Fechar navegação lateral">Fechar</button>
      </div>
      <SidebarContent onNavigate={onNavigate} />
    </aside>
  )
}
