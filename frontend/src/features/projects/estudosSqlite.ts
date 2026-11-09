/**
 * Leitura do banco SQLite do controle de projetos (ESTUDOS.sqlite).
 * Arquivo SEM imports: é usado pelo navegador (importação manual) e pelo servidor
 * (sincronização automática com o OneDrive, api/projects-sync.ts).
 * Tabelas usadas: projeto, atividade e, para os executores, programacao + pessoa.
 */

/** O mínimo do sql.js que a leitura usa. */
export type SqliteStatement = {
  bind(values: string[]): boolean
  step(): boolean
  getAsObject(): Record<string, unknown>
  free(): boolean
}
export type SqliteDatabase = { prepare(sql: string): SqliteStatement }

export type EstudosActivity = { name: string; complement: string | null; executorName: string | null }
export type EstudosProject = {
  code: string
  status: string
  supervisionCode: string | null
  client: string
  finalClient: string | null
  location: string | null
  marketSegment: string | null
  description: string
  active: boolean
  activities: EstudosActivity[]
}

export type SqliteProjectData = {
  projects: EstudosProject[]
  statuses: Array<{ status: string; count: number }>
}

/** Situações que entram marcadas na importação (as demais podem ser marcadas pela diretoria). */
export const DEFAULT_SQLITE_STATUSES = ['Em andamento', 'Em abertura']
/** Situações em que o projeto fica disponível para apontamento. */
const OPEN_STATUSES = new Set(DEFAULT_SQLITE_STATUSES)
const IGNORED_EXECUTORS = new Set(['diversos', 'pendente', 'a definir', '-'])

const clip = (value: unknown, max: number) => {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value === null || value === undefined ? '' : String(value).trim()
  return text.length > max ? text.slice(0, max).trim() : text
}

function rows(db: SqliteDatabase, sql: string): Array<Record<string, unknown>> {
  const statement = db.prepare(sql)
  const result: Array<Record<string, unknown>> = []
  try {
    while (statement.step()) result.push(statement.getAsObject())
  } finally {
    statement.free()
  }
  return result
}

function hasTable(db: SqliteDatabase, name: string) {
  const statement = db.prepare("select 1 from sqlite_master where type = 'table' and name = ?")
  try {
    statement.bind([name])
    return statement.step()
  } finally {
    statement.free()
  }
}

/** Extrai projetos e atividades de um banco já aberto. */
export function projectsFromDatabase(db: SqliteDatabase): SqliteProjectData {
  if (!hasTable(db, 'projeto') || !hasTable(db, 'atividade')) {
    throw new Error('Este arquivo não tem as tabelas de projetos (projeto e atividade).')
  }
  const projectRows = rows(db, 'select codigo, supervisao, cliente, cliente_final, local, seg_mercado, descricao, status from projeto order by codigo')
  const activityRows = rows(db, 'select id, projeto, atividade, complemento, executor_manual from atividade order by projeto, ordem')

  // Pessoas programadas em cada atividade (pessoas ativas).
  const scheduled = new Map<string, string[]>()
  if (hasTable(db, 'programacao') && hasTable(db, 'pessoa')) {
    for (const row of rows(db, `select distinct g.atividade_id as atividade_id, p.nome as nome
        from programacao g join pessoa p on p.id = g.pessoa_id
        where g.atividade_id is not null and coalesce(p.ativo, 1) = 1
        order by p.nome`)) {
      const key = String(row.atividade_id)
      scheduled.set(key, [...(scheduled.get(key) ?? []), clip(row.nome, 160)])
    }
  }

  const byCode = new Map<string, EstudosProject>()
  for (const row of projectRows) {
    const code = clip(row.codigo, 40).toUpperCase()
    const client = clip(row.cliente, 160)
    if (!code || !client) continue
    const status = clip(row.status, 40) || 'Sem situação'
    byCode.set(code, {
      code,
      status,
      supervisionCode: clip(row.supervisao, 60) || null,
      client,
      finalClient: clip(row.cliente_final, 160) || null,
      location: clip(row.local, 160) || null,
      marketSegment: clip(row.seg_mercado, 80) || null,
      description: clip(row.descricao, 300),
      active: OPEN_STATUSES.has(status),
      activities: [],
    })
  }

  for (const row of activityRows) {
    const project = byCode.get(clip(row.projeto, 40).toUpperCase())
    const name = clip(row.atividade, 160)
    if (!project || !name) continue
    const complement = clip(row.complemento, 300) || null
    const manual = clip(row.executor_manual, 160)
    const executors = new Set<string>()
    if (manual && !IGNORED_EXECUTORS.has(manual.toLowerCase())) executors.add(manual)
    for (const person of scheduled.get(String(row.id)) ?? []) if (person) executors.add(person)
    const names: Array<string | null> = executors.size > 0 ? Array.from(executors) : [null]
    for (const executorName of names) {
      const duplicate = project.activities.some((activity) => activity.name === name && (activity.complement ?? null) === complement && (activity.executorName ?? null) === executorName)
      if (!duplicate) project.activities.push({ name, complement, executorName })
    }
  }

  const projects = Array.from(byCode.values())
  if (projects.length === 0) throw new Error('O arquivo não tem projetos para importar.')
  const counts = new Map<string, number>()
  for (const project of projects) counts.set(project.status, (counts.get(project.status) ?? 0) + 1)
  const statuses = Array.from(counts, ([status, count]) => ({ status, count }))
    .sort((left, right) => right.count - left.count || left.status.localeCompare(right.status, 'pt-BR'))
  return { projects, statuses }
}
