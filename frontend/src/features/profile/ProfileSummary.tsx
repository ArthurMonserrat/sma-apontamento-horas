import type { CollaboratorProfile } from './types'
import type { AssignmentSnapshot } from '../squads/types'

type ProfileSummaryProps = {
  profile: CollaboratorProfile
  assignment: AssignmentSnapshot | null
  /** Cargo definido pela diretoria (login Microsoft); sem ele, usa o cargo do perfil. */
  jobTitle?: string | null
  /** Login Microsoft: equipe, supervisor e cargo vêm do banco de dados. */
  managedByCompany?: boolean
}

export function ProfileSummary({ profile, assignment, jobTitle, managedByCompany = false }: ProfileSummaryProps) {
  const items = [
    ['Nome', profile.name],
    ['E-mail', profile.email],
    ['Cargo', (managedByCompany ? jobTitle : jobTitle ?? profile.jobTitle) || 'Não definido'],
    ['Status', profile.active ? 'Ativo' : 'Inativo'],
    [managedByCompany ? 'Equipe atual' : 'Squad atual', assignment?.squadName ?? 'Não definida'],
    ['Supervisor responsável', assignment?.supervisorName || 'Não definido'],
  ]

  return (
    <section className="space-y-4" aria-labelledby="profile-summary-title">
      <h2 id="profile-summary-title" className="text-lg font-extrabold ui-heading">Dados profissionais</h2>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-xl ui-surface-subtle p-4">
            <dt className="text-xs font-bold uppercase tracking-wider ui-text-subtle">{label}</dt>
            <dd className="mt-2 break-words font-bold ui-heading">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="rounded-xl border ui-callout-secondary p-4 text-sm ui-text">
        {managedByCompany
          ? 'Equipe, supervisor e cargo são definidos pela diretoria na tela Equipes.'
          : 'Use "Editar Perfil" para atualizar nome, e-mail, cargo e squad. O status segue controlado pela empresa.'}
      </p>
    </section>
  )
}
