import type { SqlJsStatic } from 'sql.js'
import type { ProjectInput } from './types'
import type { ProjectImportPreview } from './projectExcelImport'
import { projectsFromDatabase, type SqliteProjectData } from './estudosSqlite'

export { DEFAULT_SQLITE_STATUSES, projectsFromDatabase, type EstudosProject as SqliteProject, type SqliteProjectData } from './estudosSqlite'

/**
 * Lê o banco SQLite do controle de projetos (ESTUDOS.sqlite) no navegador.
 * Usa as tabelas projeto (código, supervisão, cliente, local, segmento, descrição, status)
 * e atividade (atividade, complemento, executor). O executor vem do campo "executor"
 * da atividade e das pessoas programadas nela (tabela programacao).
 * O arquivo não sai do computador: só os projetos escolhidos são gravados no Banco 1.
 */

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
