import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listCorporatePeople, type CorporatePerson } from '../corporate/corporateData'
import { projectService, type ProjectService } from './infrastructure/projectService'
import { readProjectWorkbook, type ProjectImportPreview } from './projectExcelImport'
import { DEFAULT_SQLITE_STATUSES, readProjectSqlite, sqlitePreview, type SqliteProjectData } from './projectSqliteImport'
import { projectActivityLabel, type Project } from './types'

type ActivityForm = { key: string; name: string; complement: string; executorId: string; executorName: string }
type FormState = {
  isNew: boolean
  code: string
  supervisionCode: string
  client: string
  finalClient: string
  location: string
  marketSegment: string
  description: string
  activities: ActivityForm[]
}

let keySeed = 0
const nextKey = () => `a${++keySeed}`
const emptyActivity = (): ActivityForm => ({ key: nextKey(), name: '', complement: '', executorId: '', executorName: '' })
const emptyForm = (): FormState => ({ isNew: true, code: '', supervisionCode: '', client: '', finalClient: '', location: '', marketSegment: '', description: '', activities: [emptyActivity()] })

function formFromProject(project: Project): FormState {
  const activities = project.activities.filter((activity) => activity.active)
  return {
    isNew: false,
    code: project.code,
    supervisionCode: project.supervisionCode ?? '',
    client: project.client,
    finalClient: project.finalClient ?? '',
    location: project.location ?? '',
    marketSegment: project.marketSegment ?? '',
    description: project.description,
    activities: activities.length > 0
      ? activities.map((activity) => ({ key: nextKey(), name: activity.name, complement: activity.complement ?? '', executorId: activity.executorId ?? '', executorName: activity.executorId ? '' : activity.executorName ?? '' }))
      : [emptyActivity()],
  }
}

const inputClassName = 'mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-2 text-sm font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20'
const labelClassName = 'text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]'
const primaryButton = 'rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60'
const secondaryButton = 'rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-bold text-[var(--color-text)] hover:bg-[var(--color-surface-subtle)] disabled:cursor-not-allowed disabled:opacity-60'

function executorText(activity: Project['activities'][number]) {
  if (activity.executorName) return activity.executorId ? activity.executorName : `${activity.executorName} (não encontrado)`
  return 'Qualquer pessoa'
}

/**
 * Projetos do Banco 1 (diretoria): cadastro manual e importação da planilha
 * "Projeto | Supervisão | Executor | Cliente | Cliente Final | Local | Seg. Mercado | Descrição | Atividades | Complemento".
 */
export function ProjectsPanel({ service = projectService, loadPeople = listCorporatePeople, readSqlite = readProjectSqlite }: {
  service?: ProjectService
  loadPeople?: () => Promise<CorporatePerson[]>
  readSqlite?: (file: File) => Promise<SqliteProjectData>
}) {
  const [projects, setProjects] = useState<Project[]>([])
  const [people, setPeople] = useState<CorporatePerson[]>([])
  const [isLoading, setLoading] = useState(true)
  const [isSaving, setSaving] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<FormState | null>(null)
  const [excelPreview, setExcelPreview] = useState<ProjectImportPreview | null>(null)
  const [sqliteData, setSqliteData] = useState<SqliteProjectData | null>(null)
  const [sqliteStatuses, setSqliteStatuses] = useState<string[]>(DEFAULT_SQLITE_STATUSES)
  const [isReading, setReading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const fileInput = useRef<HTMLInputElement>(null)
  const sqliteInput = useRef<HTMLInputElement>(null)
  const preview = useMemo(() => sqliteData ? sqlitePreview(sqliteData, sqliteStatuses) : excelPreview, [excelPreview, sqliteData, sqliteStatuses])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [loadedProjects, loadedPeople] = await Promise.all([service.list({ includeInactive: true }), loadPeople()])
      setProjects(loadedProjects)
      setPeople([...loadedPeople].sort((left, right) => left.name.localeCompare(right.name, 'pt-BR')))
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os projetos.')
    } finally {
      setLoading(false)
    }
  }, [service, loadPeople])

  useEffect(() => { void load() }, [load])

  const visibleProjects = useMemo(() => {
    const term = search.trim().toLowerCase()
    return projects.filter((project) => (showInactive || project.active) && (!term || [project.code, project.client, project.finalClient, project.description, project.supervisionCode]
      .some((value) => value?.toLowerCase().includes(term))))
  }, [projects, search, showInactive])

  function reportResult(result: Awaited<ReturnType<ProjectService['save']>>, prefix: string) {
    const parts = [`${result.projectsCreated} projeto(s) novo(s)`, `${result.projectsUpdated} atualizado(s)`, `${result.activitiesSaved} atividade(s)`]
    if (result.activitiesRemoved > 0) parts.push(`${result.activitiesRemoved} atividade(s) removida(s)`)
    setMessage(`${prefix}: ${parts.join(', ')}.`)
    setWarnings(result.unmatchedExecutors)
  }

  function closePreview() {
    setExcelPreview(null)
    setSqliteData(null)
  }

  async function handleFile(file: File | undefined, kind: 'excel' | 'sqlite') {
    if (!file) return
    setError(null)
    setMessage(null)
    setWarnings([])
    setForm(null)
    closePreview()
    setReading(true)
    try {
      if (kind === 'excel') {
        setExcelPreview(await readProjectWorkbook(file))
      } else {
        const data = await readSqlite(file)
        setSqliteStatuses(DEFAULT_SQLITE_STATUSES.filter((status) => data.statuses.some((item) => item.status === status)))
        setSqliteData(data)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível ler o arquivo.')
    } finally {
      setReading(false)
      if (fileInput.current) fileInput.current.value = ''
      if (sqliteInput.current) sqliteInput.current.value = ''
    }
  }

  async function confirmImport() {
    if (!preview) return
    if (preview.projects.length === 0) {
      setError('Nenhum projeto selecionado para importar.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await service.save(preview.projects, { replaceActivities: false })
      reportResult(result, 'Importação concluída')
      closePreview()
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível importar a planilha.')
    } finally {
      setSaving(false)
    }
  }

  async function saveForm() {
    if (!form) return
    setSaving(true)
    setError(null)
    setMessage(null)
    setWarnings([])
    try {
      if (form.isNew && projects.some((project) => project.code.toUpperCase() === form.code.trim().toUpperCase())) {
        throw new Error(`Já existe o projeto ${form.code.trim().toUpperCase()}. Use Editar.`)
      }
      const result = await service.save([{
        code: form.code,
        supervisionCode: form.supervisionCode,
        client: form.client,
        finalClient: form.finalClient,
        location: form.location,
        marketSegment: form.marketSegment,
        description: form.description,
        activities: form.activities.map((activity) => ({
          name: activity.name,
          complement: activity.complement,
          executorId: activity.executorId || null,
          executorName: activity.executorId ? null : activity.executorName,
        })),
      }], { replaceActivities: true })
      reportResult(result, 'Projeto salvo')
      setForm(null)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o projeto.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(project: Project) {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      await service.setActive(project.id, !project.active)
      setMessage(`Projeto ${project.code} ${project.active ? 'desativado' : 'reativado'}.`)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível alterar o projeto.')
    } finally {
      setSaving(false)
    }
  }

  function updateActivity(key: string, patch: Partial<ActivityForm>) {
    setForm((current) => current && { ...current, activities: current.activities.map((activity) => activity.key === key ? { ...activity, ...patch } : activity) })
  }

  return (
    <section className="space-y-5" aria-labelledby="projects-title">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="ui-eyebrow text-xs font-bold uppercase tracking-[0.16em]">Banco de dados</p>
          <h1 id="projects-title" className="mt-2 text-3xl font-extrabold text-[var(--color-text)]">Projetos</h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">Os colaboradores apontam horas nas atividades em que são executores e nas atividades sem executor.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={fileInput} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" aria-label="Arquivo Excel de projetos" onChange={(event) => void handleFile(event.target.files?.[0], 'excel')} />
          <input ref={sqliteInput} type="file" accept=".sqlite,.sqlite3,.db" className="hidden" aria-label="Banco SQLite de projetos" onChange={(event) => void handleFile(event.target.files?.[0], 'sqlite')} />
          <button type="button" className={secondaryButton} disabled={isSaving || isReading} onClick={() => fileInput.current?.click()}>Importar Excel</button>
          <button type="button" className={secondaryButton} disabled={isSaving || isReading} onClick={() => sqliteInput.current?.click()}>Importar banco (.sqlite)</button>
          <button type="button" className={primaryButton} disabled={isSaving} onClick={() => { setForm(emptyForm()); setMessage(null); setWarnings([]) }}>Novo projeto</button>
        </div>
      </div>

      {error && <div role="alert" className="rounded-2xl border border-[var(--color-danger)] bg-[var(--color-surface)] p-4 text-sm font-semibold text-[var(--color-danger)]">{error}</div>}
      {message && <div role="status" className="rounded-2xl border border-[var(--color-primary)] bg-[var(--color-surface)] p-4 text-sm font-semibold text-[var(--color-text)]">{message}</div>}
      {warnings.length > 0 && (
        <div role="alert" className="rounded-2xl border border-amber-500 bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text)]">
          <p className="font-bold">Executores não encontrados entre as pessoas do Banco 1 (a atividade ficou sem vínculo; corrija em Editar):</p>
          <p className="mt-1">{warnings.join(', ')}</p>
        </div>
      )}

      {isReading && <p role="status" className="text-sm font-semibold text-[var(--color-text-muted)]">Lendo o arquivo…</p>}

      {preview && (
        <section aria-label="Prévia da importação" className="rounded-2xl border border-[var(--color-primary)] bg-[var(--color-surface)] p-5 shadow-sm">
          <h2 className="text-lg font-extrabold">Prévia da importação {sqliteData ? '(banco SQLite)' : '(Excel)'}</h2>
          {sqliteData && (
            <fieldset className="mt-3">
              <legend className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">Situação dos projetos a importar</legend>
              <div className="mt-2 flex flex-wrap gap-4">
                {sqliteData.statuses.map((item) => (
                  <label key={item.status} className="flex items-center gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={sqliteStatuses.includes(item.status)}
                      onChange={(event) => setSqliteStatuses((current) => event.target.checked ? [...current, item.status] : current.filter((status) => status !== item.status))}
                    />
                    {item.status} ({item.count})
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">Só “Em andamento” e “Em abertura” ficam disponíveis para apontamento; as outras situações entram como inativas.</p>
            </fieldset>
          )}
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {preview.rows} linha(s) lida(s) · {preview.projects.length} projeto(s) · {preview.projects.reduce((total, project) => total + project.activities.length, 0)} atividade(s)
            {preview.skippedRows.length > 0 && ` · linhas ignoradas (sem projeto ou cliente): ${preview.skippedRows.join(', ')}`}
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">Projetos que já existem são atualizados; as atividades do arquivo são acrescentadas.</p>
          <div className="mt-4 max-h-80 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-[var(--color-text-muted)]"><tr><th className="p-2">Projeto</th><th className="p-2">Cliente</th><th className="p-2">Descrição</th><th className="p-2">Atividades</th></tr></thead>
              <tbody>
                {preview.projects.map((project) => (
                  <tr key={project.code} className="border-t border-[var(--color-border)] align-top">
                    <td className="p-2 font-bold">{project.code}{project.active === false && <span className="ml-1 text-xs font-semibold text-[var(--color-text-muted)]">(inativo)</span>}{projects.some((existing) => existing.code === project.code) && <span className="ml-1 text-xs font-semibold text-[var(--color-text-muted)]">(atualiza)</span>}</td>
                    <td className="p-2">{project.client}{project.finalClient && project.finalClient !== project.client ? ` / ${project.finalClient}` : ''}</td>
                    <td className="p-2">{project.description}</td>
                    <td className="p-2">{project.activities.map((activity) => `${projectActivityLabel({ name: activity.name, complement: activity.complement ?? null })}${activity.executorName ? ` (${activity.executorName})` : ''}`).join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" className={primaryButton} disabled={isSaving} onClick={() => void confirmImport()}>{isSaving ? 'Importando…' : 'Confirmar importação'}</button>
            <button type="button" className={secondaryButton} disabled={isSaving} onClick={closePreview}>Cancelar</button>
          </div>
        </section>
      )}

      {form && (
        <section aria-label={form.isNew ? 'Novo projeto' : `Editar projeto ${form.code}`} className="rounded-2xl border border-[var(--color-primary)] bg-[var(--color-surface)] p-5 shadow-sm">
          <h2 className="text-lg font-extrabold">{form.isNew ? 'Novo projeto' : `Editar projeto ${form.code}`}</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className={labelClassName}>Projeto (código)<input value={form.code} disabled={!form.isNew} onChange={(event) => setForm({ ...form, code: event.target.value })} className={inputClassName} /></label>
            <label className={labelClassName}>Supervisão<input value={form.supervisionCode} onChange={(event) => setForm({ ...form, supervisionCode: event.target.value })} className={inputClassName} /></label>
            <label className={labelClassName}>Cliente<input value={form.client} onChange={(event) => setForm({ ...form, client: event.target.value })} className={inputClassName} /></label>
            <label className={labelClassName}>Cliente final<input value={form.finalClient} onChange={(event) => setForm({ ...form, finalClient: event.target.value })} className={inputClassName} /></label>
            <label className={labelClassName}>Local<input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} className={inputClassName} /></label>
            <label className={labelClassName}>Seg. mercado<input value={form.marketSegment} onChange={(event) => setForm({ ...form, marketSegment: event.target.value })} className={inputClassName} /></label>
            <label className={`${labelClassName} md:col-span-2`}>Descrição<input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={inputClassName} /></label>
          </div>
          <h3 className="mt-5 text-sm font-extrabold">Atividades</h3>
          <div className="mt-2 space-y-2">
            {form.activities.map((activity, index) => (
              <div key={activity.key} className="grid gap-2 rounded-xl border border-[var(--color-border)] p-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
                <label className={labelClassName}>Atividade {index + 1}<input value={activity.name} onChange={(event) => updateActivity(activity.key, { name: event.target.value })} className={inputClassName} /></label>
                <label className={labelClassName}>Complemento<input value={activity.complement} onChange={(event) => updateActivity(activity.key, { complement: event.target.value })} className={inputClassName} /></label>
                <label className={labelClassName}>Executor
                  <select value={activity.executorId} onChange={(event) => updateActivity(activity.key, { executorId: event.target.value, executorName: '' })} className={inputClassName}>
                    <option value="">{activity.executorName ? `${activity.executorName} (não encontrado)` : 'Qualquer pessoa'}</option>
                    {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                  </select>
                </label>
                <button type="button" className={secondaryButton} aria-label={`Remover atividade ${index + 1}`} onClick={() => setForm({ ...form, activities: form.activities.length > 1 ? form.activities.filter((item) => item.key !== activity.key) : [emptyActivity()] })}>Remover</button>
              </div>
            ))}
          </div>
          <button type="button" className={`${secondaryButton} mt-2`} onClick={() => setForm({ ...form, activities: [...form.activities, emptyActivity()] })}>+ Atividade</button>
          <div className="mt-5 flex gap-2">
            <button type="button" className={primaryButton} disabled={isSaving} onClick={() => void saveForm()}>{isSaving ? 'Salvando…' : 'Salvar projeto'}</button>
            <button type="button" className={secondaryButton} disabled={isSaving} onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </section>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input type="search" placeholder="Buscar por projeto, cliente ou descrição" aria-label="Buscar projetos" value={search} onChange={(event) => setSearch(event.target.value)} className={`${inputClassName} sm:max-w-md`} />
        <label className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-muted)]">
          <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} /> Mostrar inativos
        </label>
      </div>

      {isLoading ? (
        <p className="text-sm text-[var(--color-text-muted)]">Carregando projetos…</p>
      ) : visibleProjects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] p-8 text-center text-sm font-semibold text-[var(--color-text-muted)]">Nenhum projeto cadastrado. Use “Novo projeto”, “Importar Excel” ou “Importar banco (.sqlite)”.</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {visibleProjects.map((project) => (
            <article key={project.id} aria-label={`Projeto ${project.code}`} className={`rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm ${project.active ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-lg font-extrabold">{project.code} {!project.active && <span className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Inativo</span>}</p>
                  <p className="text-sm font-semibold">{project.description || 'Sem descrição'}</p>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                    {[project.client, project.finalClient && project.finalClient !== project.client ? `cliente final ${project.finalClient}` : null, project.location, project.marketSegment, project.supervisionCode ? `supervisão ${project.supervisionCode}` : null].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-bold text-[var(--color-primary)]" disabled={isSaving} onClick={() => { setForm(formFromProject(project)); setMessage(null); setWarnings([]) }}>Editar</button>
                  <button type="button" className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-bold" disabled={isSaving} onClick={() => void toggleActive(project)}>{project.active ? 'Desativar' : 'Reativar'}</button>
                </div>
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {project.activities.filter((activity) => activity.active).map((activity) => (
                  <li key={activity.id} className="flex justify-between gap-3 border-t border-[var(--color-border)] pt-1">
                    <span>{projectActivityLabel(activity)}</span>
                    <span className="shrink-0 text-xs text-[var(--color-text-muted)]">{executorText(activity)}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
