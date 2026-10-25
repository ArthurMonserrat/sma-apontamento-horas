import { useNavigate } from 'react-router-dom'
import { useSession } from './useSession'
import { hasModuleAccess } from './moduleAccess'

/**
 * Volta para a tela do Ecossistema sem sair da conta, para escolher outro banco.
 * Só aparece para quem tem acesso a mais de um banco.
 */
export function SwitchSystemButton({ onNavigate, className = '' }: { onNavigate?: () => void; className?: string }) {
  const { session } = useSession()
  const navigate = useNavigate()
  if (!session?.corporateProfile || !hasModuleAccess(session.corporateProfile, 'BANCO_2')) return null

  return (
    <button
      type="button"
      onClick={() => { onNavigate?.(); navigate('/', { replace: false }) }}
      className={`mb-3 flex w-full items-center gap-2 rounded-xl border border-[var(--color-sidebar-border)] px-4 py-3 text-left text-sm font-bold text-[var(--color-sidebar-text)] hover:bg-[var(--color-navigation-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-sidebar-text)] ${className}`}
    >
      <span aria-hidden="true">⇄</span>
      Trocar de sistema
    </button>
  )
}
