import { formatDateTimePtBr, type CorporateIdentityView } from './corporateIdentity'

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-4 py-3">
      <dt className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-[var(--color-text)]">{value || 'Não informado'}</dd>
    </div>
  )
}

/** Perfil preenchido automaticamente pelo login Microsoft. Usado por colaborador, supervisor e diretoria. */
export function CorporateIdentityPanel({ identity }: { identity: CorporateIdentityView }) {
  return (
    <div className="space-y-6" data-testid="corporate-identity-panel">
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
    </div>
  )
}
