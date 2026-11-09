import { Fragment, useEffect, useMemo, useState } from 'react'
import { demoActivities } from '../../../demo/fixtures/demoData'
import { getCorporateToday, getMonthKey, getMonthRange } from '../../../shared/lib/date'
import { exportHoursReport, type HoursReportSheet } from '../infrastructure/excelExportService'
import { hoursReportService, type HoursReportService } from './hoursReportService'
import {
  collaboratorHours, decimalHours, filterRows, formatHours, generalActivityHours, hoursKpis, projectHours, teamHours, NO_TEAM,
  type ProjectHours,
} from './hoursReportModel'
import type { HoursReportRow, HoursStatusMode } from './types'

type Tab = 'projetos' | 'colaboradores' | 'supervisoes' | 'atividades'

const statusOptions: Array<{ value: HoursStatusMode; label: string }> = [
  { value: 'validas', label: 'Aprovadas + pendentes' },
  { value: 'aprovadas', label: 'Só aprovadas' },
  { value: 'pendentes', label: 'Só pendentes' },
  { value: 'rejeitadas', label: 'Só rejeitadas' },
]

const activityNames = new Map(demoActivities.map((activity) => [activity.id, activity.name]))
const defaultActivityName = (id: string) => activityNames.get(id) ?? (id || 'Sem atividade')

const fieldClass = 'mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-2.5 text-sm font-normal outline-none focus:border-[var(--color-primary)]'
const cell = 'px-3 py-2 text-left'
const percent = (part: number, total: number) => total > 0 ? `${Math.round((part / total) * 100)}%` : '—'

function Bar({ value, max }: { value: number; max: number }) {
  const width = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0
  return <span className="block h-2 w-full rounded-full bg-[var(--color-surface-subtle)]" aria-hidden="true"><span className="block h-2 rounded-full bg-[var(--color-primary)]" style={{ width: `${width}%` }} /></span>
}

function Kpi({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <article className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-extrabold text-[var(--color-primary)]">{value}</p>
      <p className="mt-1 text-xs text-[var(--color-text-muted)]">{helper}</p>
    </article>
  )
}

function buildSheets(projects: ProjectHours[], rows: HoursReportRow[], activityName: (id: string) => string, showTeams: boolean): HoursReportSheet[] {
  const collaborators = collaboratorHours(rows)
  const sheets: HoursReportSheet[] = [
    {
      name: 'Projetos', title: 'Horas por projeto',
      headers: ['Projeto', 'Descrição', 'Cliente', 'Cadastrado', 'Horas', 'Aprovadas', 'Pendentes', 'Pessoas', 'Apontamentos'],
      rows: projects.map((project) => [project.code, project.description, project.client, project.registered ? 'Sim' : 'Não', decimalHours(project.minutes), decimalHours(project.approvedMinutes), decimalHours(project.pendingMinutes), project.people.length, project.entries]),
      centered: [4, 5, 6, 7, 8, 9],
    },
    {
      name: 'Atividades por projeto', title: 'Horas por atividade de cada projeto',
      headers: ['Projeto', 'Atividade', 'Colaborador', 'Horas', '% do projeto'],
      rows: projects.flatMap((project) => project.activities.flatMap((activity) => activity.people.map((person) => [
        project.code, activity.label, person.label, decimalHours(person.minutes), project.minutes > 0 ? Math.round((person.minutes / project.minutes) * 1000) / 10 : 0,
      ]))),
      centered: [4, 5],
    },
    {
      name: 'Colaboradores', title: 'Horas por colaborador',
      headers: ['Colaborador', 'Cargo', 'Supervisão', 'Horas', 'Em projetos cadastrados', 'Aprovadas', 'Pendentes', 'Projetos'],
      rows: collaborators.map((person) => [person.label, person.jobTitle ?? '', person.team, decimalHours(person.minutes), decimalHours(person.projectMinutes), decimalHours(person.approvedMinutes), decimalHours(person.pendingMinutes), person.projects.map((project) => `${project.label} (${formatHours(project.minutes)})`).join('; ')]),
      centered: [4, 5, 6, 7],
    },
    {
      name: 'Atividades gerais', title: 'Horas por atividade realizada',
      headers: ['Atividade', 'Horas', 'Pessoas'],
      rows: generalActivityHours(rows, activityName).map((activity) => [activity.label, decimalHours(activity.minutes), activity.people]),
      centered: [2, 3],
    },
  ]
  if (showTeams) {
    sheets.splice(3, 0, {
      name: 'Supervisões', title: 'Horas por supervisão',
      headers: ['Supervisão', 'Horas', 'Em projetos cadastrados', 'Pendentes', 'Pessoas', 'Projetos'],
      rows: teamHours(rows).map((team) => [team.label, decimalHours(team.minutes), decimalHours(team.projectMinutes), decimalHours(team.pendingMinutes), team.people, team.projects]),
      centered: [2, 3, 4, 5, 6],
    })
  }
  return sheets
}

/**
 * Relatórios de projetos e horas (Banco 1, login Microsoft).
 * scope "diretoria": todas as supervisões; scope "equipe": o banco devolve só a equipe do supervisor.
 */
export function HoursReportsPanel({ scope, service = hoursReportService, activityName = defaultActivityName, exporter = exportHoursReport }: {
  scope: 'diretoria' | 'equipe'
  service?: HoursReportService
  activityName?: (id: string) => string
  exporter?: typeof exportHoursReport
}) {
  const month = getMonthRange(getMonthKey(getCorporateToday()))
  const [startDate, setStartDate] = useState(month.startDate)
  const [endDate, setEndDate] = useState(month.endDate)
  const [status, setStatus] = useState<HoursStatusMode>('validas')
  const [teamName, setTeamName] = useState('')
  const [search, setSearch] = useState('')
  const [onlyRegistered, setOnlyRegistered] = useState(false)
  const [tab, setTab] = useState<Tab>('projetos')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [rows, setRows] = useState<HoursReportRow[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isExporting, setExporting] = useState(false)
  const validRange = Boolean(startDate && endDate && startDate <= endDate)

  useEffect(() => {
    if (!validRange) return
    let active = true
    setLoading(true)
    service.load(startDate, endDate)
      .then((loaded) => { if (active) { setRows(loaded); setError(null) } })
      .catch((cause) => { if (active) { setRows([]); setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o relatório.') } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [service, startDate, endDate, validRange])

  const teamNames = useMemo(() => Array.from(new Set(rows.map((row) => row.teamName ?? NO_TEAM))).sort((left, right) => left.localeCompare(right, 'pt-BR')), [rows])
  const showTeams = scope === 'diretoria' || teamNames.length > 1
  const filtered = useMemo(() => filterRows(rows, { status, teamName: teamName || undefined }), [rows, status, teamName])
  const kpis = useMemo(() => hoursKpis(filtered), [filtered])
  const projects = useMemo(() => {
    const term = search.trim().toLowerCase()
    return projectHours(filtered, activityName).filter((project) => (!onlyRegistered || project.registered)
      && (!term || [project.code, project.description, project.client].some((value) => value.toLowerCase().includes(term))))
  }, [activityName, filtered, onlyRegistered, search])
  const collaborators = useMemo(() => collaboratorHours(filtered), [filtered])
  const teams = useMemo(() => teamHours(filtered), [filtered])
  const activities = useMemo(() => generalActivityHours(filtered, activityName), [activityName, filtered])
  const maxProject = projects[0]?.minutes ?? 0
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'projetos', label: 'Projetos' },
    { id: 'colaboradores', label: 'Colaboradores' },
    ...(showTeams ? [{ id: 'supervisoes' as Tab, label: 'Supervisões' }] : []),
    { id: 'atividades', label: 'Atividades' },
  ]

  async function handleExport() {
    setExporting(true)
    setError(null)
    try {
      await exporter(buildSheets(projects, filtered, activityName, showTeams), { startDate, endDate }, scope === 'diretoria' ? (teamName || 'Geral') : (teamName || 'Equipe'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível exportar.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <section className="space-y-5" aria-labelledby="hours-report-title">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 id="hours-report-title" className="text-2xl font-extrabold">Projetos e horas</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{scope === 'diretoria' ? 'Todas as supervisões. Apontamentos cancelados não entram.' : 'Somente a sua equipe. Apontamentos cancelados não entram.'}</p>
        </div>
        <button type="button" onClick={() => void handleExport()} disabled={!validRange || isExporting || isLoading || filtered.length === 0} className="rounded-xl border border-[var(--color-primary)] px-4 py-3 text-sm font-bold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 disabled:cursor-not-allowed disabled:opacity-50">
          {isExporting ? 'Exportando…' : 'Exportar Excel'}
        </button>
      </div>

      <section aria-label="Filtros do relatório de projetos" className="grid gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 md:grid-cols-2 xl:grid-cols-5">
        <label className="text-sm font-bold">Data inicial<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className={fieldClass} /></label>
        <label className="text-sm font-bold">Data final<input type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} className={fieldClass} /></label>
        <label className="text-sm font-bold">Situação
          <select value={status} onChange={(event) => setStatus(event.target.value as HoursStatusMode)} className={fieldClass}>
            {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        {showTeams && (
          <label className="text-sm font-bold">Supervisão
            <select value={teamName} onChange={(event) => setTeamName(event.target.value)} className={fieldClass}>
              <option value="">Todas</option>
              {teamNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        )}
        <label className="text-sm font-bold">Projeto<input type="search" placeholder="Código, descrição ou cliente" value={search} onChange={(event) => setSearch(event.target.value)} className={fieldClass} /></label>
      </section>
      {!validRange && <p role="alert" className="text-sm font-semibold text-[var(--color-danger)]">A data final deve ser igual ou posterior à data inicial.</p>}
      {error && <p role="alert" className="rounded-2xl border border-[var(--color-danger)] bg-[var(--color-surface)] p-4 text-sm font-semibold text-[var(--color-danger)]">{error}</p>}

      <section aria-label="Indicadores de projetos" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Horas no período" value={formatHours(kpis.minutes)} helper={statusOptions.find((option) => option.value === status)?.label ?? ''} />
        <Kpi label="Em projetos cadastrados" value={percent(kpis.minutes * kpis.projectShare, kpis.minutes)} helper="Do total de horas" />
        <Kpi label="Projetos com horas" value={String(kpis.registeredProjects)} helper="Cadastrados em Projetos" />
        <Kpi label="Pessoas" value={String(kpis.people)} helper="Com apontamento no período" />
        <Kpi label="Pendentes de aprovação" value={formatHours(kpis.pendingMinutes)} helper="Aguardando o supervisor" />
      </section>

      <div role="tablist" aria-label="Tipo de relatório" className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}
            className={`rounded-xl px-4 py-2 text-sm font-bold ${tab === item.id ? 'bg-[var(--color-primary)] text-white' : 'border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-subtle)]'}`}>
            {item.label}
          </button>
        ))}
      </div>

      {isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Carregando relatório…</p> : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] p-8 text-center text-sm font-semibold text-[var(--color-text-muted)]">Nenhum apontamento no período com esses filtros.</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          {tab === 'projetos' && (
            <>
              <label className="flex items-center gap-2 px-3 pt-3 text-sm font-semibold text-[var(--color-text-muted)]">
                <input type="checkbox" checked={onlyRegistered} onChange={(event) => setOnlyRegistered(event.target.checked)} /> Só projetos cadastrados
              </label>
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-xs uppercase text-[var(--color-text-muted)]"><tr><th className={cell}>Projeto</th><th className={cell}>Cliente</th><th className={cell}>Horas</th><th className={`${cell} w-40`} /><th className={cell}>Aprovadas</th><th className={cell}>Pendentes</th><th className={cell}>Pessoas</th><th className={cell} /></tr></thead>
                <tbody>
                  {projects.map((project) => (
                    <Fragment key={project.key}>
                      <tr className="border-t border-[var(--color-border)]">
                        <td className={`${cell} font-bold`}>{project.label}{!project.registered && <span className="ml-2 rounded-full bg-[var(--color-surface-subtle)] px-2 py-0.5 text-xs font-semibold text-[var(--color-text-muted)]">não cadastrado</span>}</td>
                        <td className={cell}>{project.client}</td>
                        <td className={`${cell} font-bold`}>{formatHours(project.minutes)}</td>
                        <td className={cell}><Bar value={project.minutes} max={maxProject} /></td>
                        <td className={cell}>{formatHours(project.approvedMinutes)}</td>
                        <td className={cell}>{formatHours(project.pendingMinutes)}</td>
                        <td className={cell}>{project.people.length}</td>
                        <td className={cell}>
                          <button type="button" aria-expanded={expanded === project.key} onClick={() => setExpanded(expanded === project.key ? null : project.key)} className="rounded-lg border border-[var(--color-border)] px-3 py-1 text-xs font-bold text-[var(--color-primary)]">
                            {expanded === project.key ? 'Fechar' : 'Ver atividades'}
                          </button>
                        </td>
                      </tr>
                      {expanded === project.key && (
                        <tr className="bg-[var(--color-surface-subtle)]">
                          <td colSpan={8} className="px-3 py-3">
                            <table className="w-full text-sm" aria-label={`Atividades do projeto ${project.code}`}>
                              <thead className="text-xs uppercase text-[var(--color-text-muted)]"><tr><th className={cell}>Atividade</th><th className={cell}>Horas</th><th className={cell}>% do projeto</th><th className={cell}>Quem trabalhou</th></tr></thead>
                              <tbody>
                                {project.activities.map((activity) => (
                                  <tr key={activity.key} className="border-t border-[var(--color-border)]">
                                    <td className={`${cell} font-semibold`}>{activity.label}</td>
                                    <td className={cell}>{formatHours(activity.minutes)}</td>
                                    <td className={cell}>{percent(activity.minutes, project.minutes)}</td>
                                    <td className={cell}>{activity.people.map((person) => `${person.label} (${formatHours(person.minutes)})`).join(', ')}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {tab === 'colaboradores' && (
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-xs uppercase text-[var(--color-text-muted)]"><tr><th className={cell}>Colaborador</th><th className={cell}>Cargo</th>{showTeams && <th className={cell}>Supervisão</th>}<th className={cell}>Horas</th><th className={cell}>Em projetos</th><th className={cell}>Pendentes</th><th className={cell}>Principais projetos</th></tr></thead>
              <tbody>
                {collaborators.map((person) => (
                  <tr key={person.id} className="border-t border-[var(--color-border)]">
                    <td className={`${cell} font-bold`}>{person.label}</td>
                    <td className={cell}>{person.jobTitle ?? '—'}</td>
                    {showTeams && <td className={cell}>{person.team}</td>}
                    <td className={`${cell} font-bold`}>{formatHours(person.minutes)}</td>
                    <td className={cell}>{percent(person.projectMinutes, person.minutes)}</td>
                    <td className={cell}>{formatHours(person.pendingMinutes)}</td>
                    <td className={cell}>{person.projects.slice(0, 3).map((project) => `${project.label} (${formatHours(project.minutes)})`).join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'supervisoes' && (
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-xs uppercase text-[var(--color-text-muted)]"><tr><th className={cell}>Supervisão</th><th className={cell}>Horas</th><th className={`${cell} w-40`} /><th className={cell}>Em projetos</th><th className={cell}>Pendentes</th><th className={cell}>Pessoas</th><th className={cell}>Projetos</th></tr></thead>
              <tbody>
                {teams.map((team) => (
                  <tr key={team.label} className="border-t border-[var(--color-border)]">
                    <td className={`${cell} font-bold`}>{team.label}</td>
                    <td className={`${cell} font-bold`}>{formatHours(team.minutes)}</td>
                    <td className={cell}><Bar value={team.minutes} max={teams[0]?.minutes ?? 0} /></td>
                    <td className={cell}>{percent(team.projectMinutes, team.minutes)}</td>
                    <td className={cell}>{formatHours(team.pendingMinutes)}</td>
                    <td className={cell}>{team.people}</td>
                    <td className={cell}>{team.projects}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'atividades' && (
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-xs uppercase text-[var(--color-text-muted)]"><tr><th className={cell}>Atividade realizada</th><th className={cell}>Horas</th><th className={`${cell} w-40`} /><th className={cell}>% do total</th><th className={cell}>Pessoas</th></tr></thead>
              <tbody>
                {activities.map((activity) => (
                  <tr key={activity.label} className="border-t border-[var(--color-border)]">
                    <td className={`${cell} font-bold`}>{activity.label}</td>
                    <td className={`${cell} font-bold`}>{formatHours(activity.minutes)}</td>
                    <td className={cell}><Bar value={activity.minutes} max={activities[0]?.minutes ?? 0} /></td>
                    <td className={cell}>{percent(activity.minutes, kpis.minutes)}</td>
                    <td className={cell}>{activity.people}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  )
}
