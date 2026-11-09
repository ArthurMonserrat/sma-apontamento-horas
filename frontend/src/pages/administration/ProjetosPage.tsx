import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BrandMark } from '../../shared/ui/BrandMark'
import { DirectorSidebar } from '../../app/layouts/DirectorSidebar'
import { ThemeToggle } from '../../app/layouts/ThemeToggle'
import { useSession } from '../../features/session/useSession'
import { isCorporateDataActive } from '../../features/corporate/corporateData'
import { ProjectsPanel } from '../../features/projects/ProjectsPanel'

export function ProjetosPage() {
  const { session, signOut } = useSession()
  const navigate = useNavigate()
  const corporate = isCorporateDataActive()
  const [searchParams, setSearchParams] = useSearchParams()
  // Volta do login da Microsoft (?onedrive=…): guarda a mensagem e limpa o endereço.
  const [returnParams] = useState(() => searchParams.has('onedrive') ? new URLSearchParams(searchParams) : undefined)
  useEffect(() => {
    if (searchParams.has('onedrive')) setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])

  function exit() {
    signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen overflow-x-clip bg-[var(--color-background)] text-[var(--color-text)]">
      <header className="sticky top-0 z-40 flex h-20 w-full items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-header)] px-4 shadow-sm sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <BrandMark variant="compact" />
          <div>
            <p className="ui-eyebrow text-xs font-bold uppercase tracking-[0.2em]">SM&A - Projetos</p>
            <p className="text-sm text-[var(--color-text-muted)]">Cadastro e importação de projetos</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-right text-xs font-semibold text-[var(--color-text-muted)] sm:block">{session?.name}</span>
          <ThemeToggle />
        </div>
      </header>
      <div className="flex min-w-0">
        <DirectorSidebar onSignOut={exit} />
        <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            {corporate ? <ProjectsPanel returnParams={returnParams} /> : (
              <div className="rounded-2xl border border-dashed border-[var(--color-border)] p-8 text-center text-sm font-semibold text-[var(--color-text-muted)]">
                Os projetos ficam no banco de dados. Entre com a conta Microsoft para cadastrar.
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
