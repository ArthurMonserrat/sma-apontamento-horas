import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { BrandMark } from '../../shared/ui/BrandMark'
import { DirectorSidebar } from '../../app/layouts/DirectorSidebar'
import { ThemeToggle } from '../../app/layouts/ThemeToggle'
import { useSession } from '../../features/session/useSession'
import { getCurrentSession } from '../../features/auth/infrastructure/supabaseSessionService'
import { buildCorporateIdentity, formatDateTimePtBr } from '../../features/profile/corporateIdentity'

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-4 py-3">
      <dt className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-[var(--color-text)]">{value || 'Não informado'}</dd>
    </div>
  )
}

export function DiretorPerfilPage() {
  const { session, corporateProfile, signOut } = useSession()
  const navigate = useNavigate()
  const [authUser, setAuthUser] = useState<User | null>(null)

  useEffect(() => {
    let active = true
    // Lê a sessão Supabase já guardada no navegador (sem nova chamada ao login).
    getCurrentSession()
      .then((current) => { if (active) setAuthUser(current?.user ?? null) })
      .catch(() => { if (active) setAuthUser(null) })
    return () => { active = false }
  }, [])

  const profile = corporateProfile ?? session?.corporateProfile ?? null
  const identity = useMemo(() => (profile ? buildCorporateIdentity(profile, authUser) : null), [profile, authUser])
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

            {!identity ? (
              <p role="alert" className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-sm font-semibold">
                Não foi possível carregar o perfil corporativo. Saia e entre novamente.
              </p>
            ) : (
              <>
                <section className="flex flex-col gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:flex-row sm:items-center" aria-label="Resumo do perfil">
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-xl font-extrabold text-white" aria-hidden="true">{identity.initials}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xl font-extrabold">{identity.fullName}</p>
                    <p className="truncate text-sm text-[var(--color-text-muted)]">{identity.email}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-[var(--color-primary)]/10 px-3 py-1 text-xs font-bold text-[var(--color-primary)]">{identity.roleLabel}</span>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${identity.active ? 'bg-emerald-500/15 text-emerald-600' : 'bg-red-500/15 text-red-600'}`}>{identity.active ? 'Ativo' : 'Inativo'}</span>
                  </div>
                </section>

                <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5" aria-labelledby="dados-pessoais">
                  <h2 id="dados-pessoais" className="text-lg font-extrabold">Dados pessoais</h2>
                  <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                    <ProfileField label="Nome" value={identity.firstName} />
                    <ProfileField label="Sobrenome" value={identity.lastName} />
                    <ProfileField label="Nome completo" value={identity.fullName} />
                    <ProfileField label="E-mail corporativo" value={identity.email} />
                  </dl>
                </section>

                <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5" aria-labelledby="dados-acesso">
                  <h2 id="dados-acesso" className="text-lg font-extrabold">Acesso</h2>
                  <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                    <ProfileField label="Cargo no sistema" value={identity.roleLabel} />
                    <ProfileField label="Situação" value={identity.active ? 'Ativo' : 'Inativo'} />
                    <ProfileField label="Login" value={identity.providerLabel} />
                    <ProfileField label="Primeiro acesso" value={formatDateTimePtBr(identity.firstAccessAt)} />
                    <ProfileField label="Último acesso" value={formatDateTimePtBr(identity.lastSignInAt)} />
                  </dl>
                  <p className="mt-4 text-xs text-[var(--color-text-muted)]">Nome e e-mail vêm da sua conta Microsoft. O cargo é definido pela Administração.</p>
                </section>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
