import type { Database, SqlJsStatic } from 'sql.js'
import type { ProjectInput } from './types'
import type { ProjectImportPreview } from './projectExcelImport'

/**
 * Lê o banco SQLite do controle de projetos (ESTUDOS.sqlite) no navegador.
 * Usa as tabelas projeto (código, supervisão, cliente, local, segmento, descrição, status)
 * e atividade (atividade, complemento, executor). O executor vem do campo "executor"
 * da atividade e das pessoas programadas nela (tabela programacao).
 * O arquivo não sai do computador: só os projetos escolhidos são gravados no Banco 1.
 */

export type SqliteProject = ProjectInput & { status: string }

export type SqliteProjectData = {
  projects: SqliteProject[]
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

function rows(db: Database, sql: string): Array<Record<string, unknown>> {
  const statement = db.prepare(sql)
  const result: Array<Record<string, unknown>> = []
  try {
    while (statement.step()) result.push(statement.getAsObject())
  } finally {
    statement.free()
  }
  return result
}

function hasTable(db: Database, name: string) {
  const statement = db.prepare("select 1 from sqlite_master where type = 'table' and name = ?")
  try {
    statement.bind([name])
    return statement.step()
  } finally {
    statement.free()
  }
}

/** Extrai projetos e atividades de um banco já aberto. */
export function projectsFromDatabase(db: Database): SqliteProjectData {
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

  const byCode = new Map<string, SqliteProject>()
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

/** Prévia da importação só com as situações escolhidas. */
export function sqlitePreview(data: SqliteProjectData, statuses: string[]): ProjectImportPreview {
  const chosen = new Set(statuses)
  const projects: ProjectInput[] = data.projects
    .filter((project) => chosen.has(project.status))
    .map(({ status: _status, ...project }) => project)
  const executors = new Set<string>()
  for (const project of projects) for (const activity of project.activities) if (activity.executorName) executors.add(activity.executorName)
  return {
    projects,
    rows: projects.reduce((total, project) => total + Math.max(project.activities.length, 1), 0),
    skippedRows: [],
    executors: Array.from(executors).sort((left, right) => left.localeCompare(right, 'pt-BR')),
  }
}

let sqlPromise: Promise<SqlJsStatic> | null = null

async function loadSqlJs(): Promise<SqlJsStatic> {
  sqlPromise ??= (async () => {
    const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([
      import('sql.js'),
      import('sql.js/dist/sql-wasm.wasm?url'),
    ])
    return initSqlJs({ locateFile: () => wasmUrl })
  })()
  try {
    return await sqlPromise
  } catch (error) {
    sqlPromise = null
    throw error
  }
}

const SQLITE_HEADER = 'SQLite format 3\u0000'

/** Lê o arquivo .sqlite escolhido pela diretoria. */
export async function readProjectSqlite(file: Blob, loadSql: () => Promise<SqlJsStatic> = loadSqlJs): Promise<SqliteProjectData> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const header = new TextDecoder('latin1').decode(bytes.slice(0, 16))
  if (header !== SQLITE_HEADER) throw new Error('Não foi possível ler o arquivo. Envie o banco de projetos (.sqlite).')
  let SQL: SqlJsStatic
  try {
    SQL = await loadSql()
  } catch {
    throw new Error('Não foi possível carregar o leitor de banco de dados. Verifique a conexão e tente de novo.')
  }
  const db = new SQL.Database(bytes)
  try {
    return projectsFromDatabase(db)
  } catch (error) {
    if (error instanceof Error && /tabelas de projetos|não tem projetos/.test(error.message)) throw error
    throw new Error('Não foi possível ler o arquivo. Envie o banco de projetos (.sqlite).')
  } finally {
    db.close()
  }
}
