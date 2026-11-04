import type { ProjectInput } from './types'

/**
 * Lê a planilha de projetos (modelo "Projeto | Supervisão | Executor | Cliente | Cliente Final |
 * Local | Seg. Mercado | Descrição | Atividades | Complemento"). Cada linha é projeto + atividade + executor;
 * as linhas do mesmo projeto viram um projeto com várias atividades.
 */

type Column = 'code' | 'supervision' | 'executor' | 'client' | 'finalClient' | 'location' | 'segment' | 'description' | 'activity' | 'complement'

const HEADERS: Record<string, Column> = {
  projeto: 'code',
  codigo: 'code',
  'codigo do projeto': 'code',
  supervisao: 'supervision',
  supervisor: 'supervision',
  executor: 'executor',
  colaborador: 'executor',
  cliente: 'client',
  'cliente final': 'finalClient',
  local: 'location',
  localizacao: 'location',
  'seg. mercado': 'segment',
  'seg mercado': 'segment',
  'segmento de mercado': 'segment',
  segmento: 'segment',
  descricao: 'description',
  atividades: 'activity',
  atividade: 'activity',
  complemento: 'complement',
}

export function normalizeHeader(value: unknown) {
  return String(value ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim().toLowerCase()
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    const rich = value as { richText?: Array<{ text: string }>; text?: unknown; result?: unknown }
    if (Array.isArray(rich.richText)) return rich.richText.map((part) => part.text).join('').trim()
    if (rich.text !== undefined) return cellText(rich.text)
    if (rich.result !== undefined) return cellText(rich.result)
  }
  return String(value).trim()
}

export type ProjectImportPreview = {
  projects: ProjectInput[]
  rows: number
  skippedRows: number[]
  executors: string[]
}

/** Converte as linhas da planilha (primeira linha com cabeçalhos) em projetos. */
export function projectsFromRows(rows: unknown[][]): ProjectImportPreview {
  const headerIndex = rows.findIndex((row) => row.some((cell) => HEADERS[normalizeHeader(cellText(cell))] === 'code'))
  if (headerIndex < 0) throw new Error('Não encontrei a coluna "Projeto" na planilha.')
  const columns = new Map<Column, number>()
  rows[headerIndex].forEach((cell, index) => {
    const column = HEADERS[normalizeHeader(cellText(cell))]
    if (column && !columns.has(column)) columns.set(column, index)
  })
  if (!columns.has('client')) throw new Error('Não encontrei a coluna "Cliente" na planilha.')
  const get = (row: unknown[], column: Column) => {
    const index = columns.get(column)
    return index === undefined ? '' : cellText(row[index])
  }

  const byCode = new Map<string, ProjectInput>()
  const skippedRows: number[] = []
  const executors = new Set<string>()
  let used = 0
  rows.slice(headerIndex + 1).forEach((row, offset) => {
    if (!row.some((cell) => cellText(cell))) return
    const code = get(row, 'code').toUpperCase()
    const client = get(row, 'client')
    if (!code || !client) {
      skippedRows.push(headerIndex + offset + 2)
      return
    }
    used += 1
    let project = byCode.get(code)
    if (!project) {
      project = {
        code,
        supervisionCode: get(row, 'supervision') || null,
        client,
        finalClient: get(row, 'finalClient') || null,
        location: get(row, 'location') || null,
        marketSegment: get(row, 'segment') || null,
        description: get(row, 'description'),
        activities: [],
      }
      byCode.set(code, project)
    }
    const name = get(row, 'activity')
    const executorName = get(row, 'executor') || null
    if (executorName) executors.add(executorName)
    if (!name) return
    const complement = get(row, 'complement') || null
    const duplicate = project.activities.some((activity) => activity.name === name && (activity.complement ?? null) === complement && (activity.executorName ?? null) === executorName)
    if (!duplicate) project.activities.push({ name, complement, executorName })
  })

  if (byCode.size === 0) throw new Error('A planilha não tem projetos para importar.')
  return { projects: Array.from(byCode.values()), rows: used, skippedRows, executors: Array.from(executors).sort((left, right) => left.localeCompare(right, 'pt-BR')) }
}

/** Lê o arquivo .xlsx no navegador (primeira aba). */
export async function readProjectWorkbook(file: Blob): Promise<ProjectImportPreview> {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(await file.arrayBuffer())
  } catch {
    throw new Error('Não foi possível ler o arquivo. Envie uma planilha do Excel (.xlsx).')
  }
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new Error('A planilha está vazia.')
  const rows: unknown[][] = []
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : []
    rows.push(values)
  })
  return projectsFromRows(rows)
}
