import { forwardRef } from 'react'
import { ThemeToggle } from './ThemeToggle'
import { useSession } from '../../features/session/useSession'
import { BrandMark } from '../../shared/ui/BrandMark'
import { OfflineStatusIndicator } from '../../features/offline/ui/OfflineStatusIndicator'

type HeaderProps = {
  isMenuOpen: boolean
  onMenuToggle: () => void
}

export const Header = forwardRef<HTMLButtonElement, HeaderProps>(function Header({ isMenuOpen, onMenuToggle }, menuButtonRef) {
  const { profile } = useSession()
  return (
    <header data-layout-region="global-header" className="sticky top-0 z-40 flex h-20 w-full items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-header)] px-4 shadow-sm sm:px-6 lg:px-8">
      <div className="flex items-center gap-3">
        <button
          ref={menuButtonRef}
          type="button"
          onClick={onMenuToggle}
          className="rounded-lg border border-[var(--color-border)] p-2 text-[var(--color-primary)] transition hover:bg-[var(--color-surface-subtle)] md:hidden"
          aria-label={isMenuOpen ? 'Fechar navegação lateral' : 'Abrir navegação lateral'}
          aria-controls="collaborator-mobile-navigation"
          aria-expanded={isMenuOpen}
        >
          <span aria-hidden="true">☰</span>
        </button>
        <BrandMark variant="compact" />
        <div className="hidden md:block">
          <p className="ui-eyebrow text-xs font-bold uppercase tracking-[0.2em]">Área do colaborador</p>
          <p className="text-sm text-[var(--color-text-muted)]">Apontamento de horas por projeto</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <OfflineStatusIndicator />
        <span className="hidden text-right text-xs font-semibold text-[var(--color-text-muted)] sm:block">{profile?.name}</span>
        <ThemeToggle />
      </div>
    </header>
  )
})
