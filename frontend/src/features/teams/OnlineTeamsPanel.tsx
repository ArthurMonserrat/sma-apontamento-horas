import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CorporatePerson } from '../corporate/corporateData'
import { onlineTeamService, type OnlineTeam, type OnlineTeamService } from './infrastructure/onlineTeamService'

type FormState = {
  id?: string
  name: string
  supervisorId: string
  coSupervisorIds: string[]
  memberIds: string[]
}

const emptyForm: FormState = { name: '', supervisorId: '', coSupervisorIds: [], memberIds: [] }

const roleLabel: Record<CorporatePerson['role'], string> = {
  colaborador: 'Colaborador',
  supervisor: 'Supervisor',
  diretor: 'Diretoria',
}

const JOB_TITLE_OPTIONS = ['Engenheiro', 'Projetista', 'Desenhista', 'Estagiário', 'Estagiário 4h']

function JobTitleSelect({ person, disabled, onChange }: { person: CorporatePerson; disabled: boolean; onChange: (person: CorporatePerson, jobTitle: string) => void }) {
  const current = person.jobTitle ?? ''
  return (
    <select
      aria-label={`Cargo de ${person.name}`}
      value={current}
      disabled={disabled}
      onChange={(event) => onChange(person, event.target.value)}
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-2 py-1 text-xs font-semibold text-[var(--color-text)]"
    >
      <option value="">Sem cargo</option>
      {JOB_TITLE_OPTIONS.map((title) => <option key={title} value={title}>{title}</option>)}
      {current && !JOB_TITLE_OPTIONS.includes(current) && <option value={current}>{current}</option>}
    </select>
  )
}

const inputClassName = 'mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-2 text-sm font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20'

/**
 * Supervisões do Banco 1 gravadas no banco de dados (login Microsoft).
 * A diretoria cria a supervisão, escolhe o supervisor e os colaboradores; o supervisor
 * passa a ver e aprovar os apontamentos da equipe.
 */
export function OnlineTeamsPanel({ service = onlineTeamService, onExportTeam, isExporting = false }: {
  service?: OnlineTeamService
  /** Exporta as horas da supervisão no mês/ano escolhido na página. */
  onExportTeam?: (team: OnlineTeam) => void
  isExporting?: boolean
}) {
  const [teams, setTeams] = useState<OnlineTeam[]>([])
  const [people, setPeople] = useState<CorporatePerson[]>([])
  const [isLoading, setLoading] = useState(true)
  const [isSaving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const loadedPeople = await service.listPeopleForTeams()
      const loadedTeams = await service.listTeams(loadedPeople)
      setPeople(loadedPeople)
      setTeams(loadedTeams)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as supervisões.')
    } finally {
      setLoading(false)
    }
  }, [service])

  useEffect(() => { void load() }, [load])

  const teamNameById = useMemo(() => new Map(teams.map((team) => [team.id, team.name])), [teams])
  const sortedPeople = useMemo(() => [...people].sort((left, right) => left.name.localeCompare(right.name, 'pt-BR')), [people])

  function startCreate() {
    setMessage(null)
    setError(null)
    setForm({ ...emptyForm })
  }

  function startEdit(team: OnlineTeam) {
    setMessage(null)
    setError(null)
    setForm({ id: team.id, name: team.name, supervisorId: team.supervisorId ?? '', coSupervisorIds: team.coSupervisorIds, memberIds: team.members.map((member) => member.id) })
  }

  function toggleCoSupervisor(personId: string) {
    setForm((current) => current && ({
      ...current,
      coSupervisorIds: current.coSupervisorIds.includes(personId)
        ? current.coSupervisorIds.filter((id) => id !== personId)
        : [...current.coSupervisorIds, personId],
      // Quem vira supervisor sai da lista de colaboradores.
      memberIds: current.memberIds.filter((id) => id !== personId),
    }))
  }

  function toggleMember(personId: string) {
    setForm((current) => current && ({
      ...current,
      memberIds: current.memberIds.includes(personId)
        ? current.memberIds.filter((id) => id !== personId)
        : [...current.memberIds, personId],
    }))
  }

  async function save() {
    if (!form || isSaving) return
    setSaving(true)
    setError(null)
    try {
      await service.saveTeam(form)
      setMessage(form.id ? 'Supervisão atualizada no banco de dados.' : 'Supervisão criada no banco de dados.')
      setForm(null)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a supervisão.')
    } finally {
      setSaving(false)
    }
  }

  async function changeJobTitle(person: CorporatePerson, jobTitle: string) {
    if (isSaving) return
    setSaving(true)
    setError(null)
    try {
      await service.setJobTitle(person.id, jobTitle)
      setMessage(jobTitle ? `Cargo de ${person.name}: ${jobTitle}.` : `Cargo de ${person.name} removido.`)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o cargo.')
    } finally {
      setSaving(false)
    }
  }

  async function deactivate(team: OnlineTeam) {
    if (isSaving) return
    if (typeof window !== 'undefined' && !window.confirm(`Desativar a supervisão ${team.name}? Os colaboradores ficam sem equipe.`)) return
    setSaving(true)
    setError(null)
    try {
      await service.deactivateTeam(team.id)
      setMessage(`Supervisão ${team.name} desativada.`)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível desativar a supervisão.')
    } finally {
      setSaving(false)
    }
  }

  const supervisorIds = new Set(teams.flatMap((team) => [team.supervisorId, ...team.coSupervisorIds]))
  const withoutTeam = sortedPeople.filter((person) => !person.teamId && !supervisorIds.has(person.id) && person.role !== 'diretor')
  const supervisor = form ? people.find((person) => person.id === form.supervisorId) : undefined
  const candidates = form ? sortedPeople.filter((person) => person.id !== form.supervisorId && !form.coSupervisorIds.includes(person.id)) : []
  const coSupervisorCandidates = form ? sortedPeople.filter((person) => person.id !== form.supervisorId) : []
  const coSupervisorsAsCollaborators = form ? people.filter((person) => form.coSupervisorIds.includes(person.id) && person.role === 'colaborador') : []

  return (
    <section className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm" aria-labelledby="online-teams-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="ui-eyebrow text-xs font-bold uppercase tracking-[0.16em]">Online · banco de dados</p>
          <h2 id="online-teams-title" className="mt-1 text-xl font-extrabold text-[var(--color-text)]">Supervisões do Banco 1</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">O supervisor vê e aprova os apontamentos dos colaboradores da supervisão dele.</p>
        </div>
        {!form && (
          <button type="button" onClick={startCreate} disabled={isLoading} className="rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60">
            + Nova supervisão
          </button>
        )}
      </div>

      {error && <p role="alert" className="rounded-xl border border-[var(--color-danger)] p-3 text-sm font-semibold text-[var(--color-danger)]">{error}</p>}
      {message && <p role="status" className="rounded-xl border border-[var(--color-primary)] p-3 text-sm font-semibold text-[var(--color-primary)]">{message}</p>}

      {form && (
        <div className="rounded-2xl border border-[var(--color-primary)] p-4" aria-label={form.id ? 'Editar supervisão' : 'Nova supervisão'}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
              Nome da supervisão
              <input type="text" value={form.name} maxLength={120} placeholder="Ex.: S12 - RENATO" onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClassName} />
            </label>
            <label className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
              Supervisor
              <select value={form.supervisorId} onChange={(event) => setForm({ ...form, supervisorId: event.target.value, coSupervisorIds: form.coSupervisorIds.filter((id) => id !== event.target.value), memberIds: form.memberIds.filter((id) => id !== event.target.value) })} className={inputClassName}>
                <option value="">Escolha o supervisor</option>
                {sortedPeople.map((person) => <option key={person.id} value={person.id}>{person.name} ({roleLabel[person.role]})</option>)}
              </select>
            </label>
          </div>
          {supervisor?.role === 'colaborador' && (
            <p className="mt-2 text-xs font-semibold text-[var(--color-text-muted)]">{supervisor.name} está como colaborador no Banco 1 e passará a supervisor ao salvar.</p>
          )}
          <fieldset className="mt-4">
            <legend className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Supervisores adicionais ({form.coSupervisorIds.length})</legend>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">Também veem e aprovam os apontamentos e ausências desta supervisão.</p>
            <div className="mt-2 grid max-h-48 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
              {coSupervisorCandidates.map((person) => {
                const checked = form.coSupervisorIds.includes(person.id)
                return (
                  <label key={person.id} className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2 text-sm ${checked ? 'border-[var(--color-primary)] bg-[var(--color-surface-subtle)]' : 'border-[var(--color-border)]'}`}>
                    <input type="checkbox" aria-label={`Supervisor adicional: ${person.name}`} checked={checked} onChange={() => toggleCoSupervisor(person.id)} className="accent-[var(--color-primary)]" />
                    <span className="font-bold text-[var(--color-text)]">{person.name}</span>
                  </label>
                )
              })}
            </div>
            {coSupervisorsAsCollaborators.length > 0 && (
              <p className="mt-2 text-xs font-semibold text-[var(--color-text-muted)]">{coSupervisorsAsCollaborators.map((person) => person.name).join(', ')} passará(ão) a supervisor ao salvar.</p>
            )}
          </fieldset>
          <fieldset className="mt-4">
            <legend className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Colaboradores ({form.memberIds.length})</legend>
            {candidates.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">Nenhuma pessoa disponível.</p>
            ) : (
              <div className="mt-2 grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
                {candidates.map((person) => {
                  const checked = form.memberIds.includes(person.id)
                  const currentTeam = person.teamId && person.teamId !== form.id ? teamNameById.get(person.teamId) ?? person.teamName : null
                  return (
                    <label key={person.id} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm ${checked ? 'border-[var(--color-primary)] bg-[var(--color-surface-subtle)]' : 'border-[var(--color-border)]'}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleMember(person.id)} className="mt-1 accent-[var(--color-primary)]" />
                      <span>
                        <span className="block font-bold text-[var(--color-text)]">{person.name}</span>
                        <span className="block text-xs text-[var(--color-text-muted)]">{person.jobTitle ? `${person.jobTitle} · ` : ''}{person.email}</span>
                        {currentTeam && <span className="block text-xs font-semibold text-[var(--color-text-muted)]">Hoje em {currentTeam}{checked ? ' — será movido' : ''}</span>}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
          </fieldset>
          <p className="mt-3 text-xs text-[var(--color-text-muted)]">Só aparecem pessoas que já entraram com a conta Microsoft e têm acesso ao Banco 1.</p>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => setForm(null)} disabled={isSaving} className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-bold text-[var(--color-text-muted)]">Cancelar</button>
            <button type="button" onClick={() => void save()} disabled={isSaving || !form.name.trim() || !form.supervisorId} className="rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60">
              {isSaving ? 'Salvando…' : 'Salvar no banco'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-[var(--color-text-muted)]">Carregando supervisões…</p>
      ) : teams.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--color-border)] p-6 text-center text-sm font-semibold text-[var(--color-text-muted)]">Nenhuma supervisão cadastrada ainda.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((team) => (
            <article key={team.id} className="rounded-2xl border border-[var(--color-border)] p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-extrabold text-[var(--color-text)]">{team.name}</h3>
                  <p className="text-sm font-bold text-[var(--color-primary)]">{team.coSupervisorNames.length > 0 ? 'Supervisores' : 'Supervisor'}: {[team.supervisorName, ...team.coSupervisorNames].join(', ')}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => startEdit(team)} disabled={isSaving} className="rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs font-bold text-[var(--color-primary)]">Editar</button>
                  <button type="button" onClick={() => void deactivate(team)} disabled={isSaving} className="rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs font-bold text-[var(--color-danger)]">Desativar</button>
                </div>
              </div>
              <p className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{team.members.length} colaborador(es)</p>
              <ul className="mt-1 space-y-1.5 text-sm text-[var(--color-text)]">
                {team.members.map((member) => (
                  <li key={member.id} className="flex items-center justify-between gap-2">
                    <span>{member.name}</span>
                    <JobTitleSelect person={member} disabled={isSaving} onChange={(person, title) => void changeJobTitle(person, title)} />
                  </li>
                ))}
              </ul>
              {onExportTeam && (
                <button type="button" onClick={() => onExportTeam(team)} disabled={isExporting} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-bold text-[var(--color-primary)] disabled:opacity-60">
                  <span className="rounded bg-[var(--color-navigation-active-detail)] px-1 text-[10px] font-black">XL</span>
                  Exportar horas da supervisão
                </button>
              )}
            </article>
          ))}
        </div>
      )}

      {!isLoading && withoutTeam.length > 0 && (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Sem supervisão ({withoutTeam.length})</p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {withoutTeam.map((person) => (
              <li key={person.id} className="flex items-center justify-between gap-2 text-sm text-[var(--color-text)]">
                <span>{person.name}</span>
                <JobTitleSelect person={person} disabled={isSaving} onChange={(changed, title) => void changeJobTitle(changed, title)} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
