import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { isMedicaoRdo, parseMedicaoRdoPages, type RdoPage } from './rdoMedicaoParser'

export type { RdoPage } from './rdoMedicaoParser'

export type ParsedRdoDay = {
  data: string
  horas: number
  minutos: number
  detalhamento: string
  numeroObra?: string
}

export type ParsedRdo = {
  modelo?: 'padrao' | 'medicao'
  numeroObra?: string
  aviso?: string
  dias: ParsedRdoDay[]
}

export type ParseRdoOptions = {
  collaboratorName?: string
}

type TextItem = { str?: string; transform?: unknown }

function toIsoDate(value: string) {
  const [, day, month, year] = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/) ?? []
  return day && month && year ? `${year}-${month}-${day}` : undefined
}

function parseDecimalHours(value: string) {
  const decimal = Number(value.replace(',', '.'))
  if (!Number.isFinite(decimal) || decimal < 0) return null
  const totalMinutes = Math.round(decimal * 60)
  return { horas: Math.floor(totalMinutes / 60), minutos: totalMinutes % 60 }
}

function parseActivityRows(section: string) {
  const cleanSection = section
    .replace(/\bHORA\s+DE\s+IN[IÍ]CIO\b/gi, ' ')
    .replace(/\bHORA\s+DE\s+T[ÉE]RMINO\b/gi, ' ')
    .replace(/\bDESCRI[ÇC][ÃA]O\s+DA\s+ATIVIDADE(?:\s+E\s+DO\s+LOCAL)?\b/gi, ' ')
  const timeRowPattern = /^\s*(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})\s*(.*)$/i
  const stopPattern = /\b(?:Total\s+(?:de\s+)?Horas|Assinatura|Respons[aá]vel|Fotos|Anexos|(?:Data\s*OS|Data)\b)/i
  const rows: Array<{ inicio: string; fim: string; descricao: string[] }> = []

  for (const rawLine of cleanSection.split('\n')) {
    const line = rawLine.replace(/\s+/g, ' ').trim()
    if (!line || stopPattern.test(line)) {
      if (stopPattern.test(line)) break
      continue
    }
    const row = line.match(timeRowPattern)
    if (row) {
      rows.push({ inicio: row[1].padStart(5, '0'), fim: row[2].padStart(5, '0'), descricao: row[3]?.trim() ? [row[3].trim()] : [] })
      continue
    }
    rows.at(-1)?.descricao.push(line)
  }

  const formattedRows = rows
    .map((row) => {
      const descricao = row.descricao.join(' ').replace(/\s+/g, ' ').trim()
      return descricao ? `[${row.inicio} - ${row.fim}] ${descricao}` : ''
    })
    .filter(Boolean)
  if (formattedRows.length > 0) return formattedRows

  const inlineRows = /(?<!\d)(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})\s+([\s\S]*?)(?=\s+\d{1,2}:\d{2}\s+\d{1,2}:\d{2}\s+|\s+Total\s+(?:de\s+)?Horas\b|$)/gi
  return Array.from(cleanSection.matchAll(inlineRows)).flatMap((match) => {
    const descricao = match[3].replace(/\s+/g, ' ').trim()
    return descricao ? [`[${match[1].padStart(5, '0')} - ${match[2].padStart(5, '0')}] ${descricao}`] : []
  })
}

function extractDetails(chunk: string) {
  const sectionPattern = /(?:HORA\s+DE\s+IN[IÍ]CIO[\s\S]{0,160}?HORA\s+DE\s+T[ÉE]RMINO[\s\S]{0,220}?)?DESCRI[ÇC][ÃA]O\s+DA\s+ATIVIDADE(?:\s+E\s+DO\s+LOCAL)?\s*([\s\S]*?)(?=\n?\s*(?:Total\s+(?:de\s+)?Horas|Assinatura|Respons[aá]vel|Fotos|Anexos|(?:Data\s*OS|Data)\b)|$)/gi
  const sections = Array.from(chunk.matchAll(sectionPattern)).map((match) => match[1])
  const rows = sections.flatMap((section) => parseActivityRows(section))
  if (rows.length > 0) return rows.join('\n\n')
  const details = sections.join(' ').replace(/\s+/g, ' ').trim()
  return details || 'Atividades importadas do RDO.'
}

function extractTotalHours(chunk: string) {
  return chunk.match(/\bTotal\s+(?:de\s+)?Horas\b[\s\S]{0,100}?([0-9]{1,2}(?:[.,][0-9]{1,2})?)\b/i)?.[1]
}

function extractProjectNumber(text: string) {
  return text.match(/\b(?:Obra|N[º°]?\s*(?:do\s+)?(?:QQP|Projeto))\s*[:#-]?\s*([A-Z0-9][A-Z0-9._/-]*)/i)?.[1]
}

export function parseRdoText(text: string): ParsedRdo {
  const normalized = text.replace(/\u00a0/g, ' ').replace(/\r/g, '\n').replace(/[ \t]+/g, ' ')
  const numeroObra = extractProjectNumber(normalized)
  const anchors = Array.from(normalized.matchAll(/\b(?:Data\s*OS|Data)\b\s*[:-]?\s*(\d{2}\/\d{2}\/\d{4})/gi))
  const dates = anchors.length > 0
    ? anchors.flatMap((match) => {
      const iso = toIsoDate(match[1])
      return iso ? [{ iso, index: match.index ?? 0 }] : []
    })
    : Array.from(normalized.matchAll(/\b(\d{2}\/\d{2}\/\d{4})\b/g)).flatMap((match) => {
      const iso = toIsoDate(match[1])
      return iso ? [{ iso, index: match.index ?? 0 }] : []
    })

  const uniqueDates = dates.filter((date, index) => dates.findIndex((item) => item.iso === date.iso) === index)
  const chunks = uniqueDates.map((date, index) => normalized.slice(date.index, uniqueDates[index + 1]?.index ?? normalized.length))
  const parsedDays = uniqueDates.flatMap((date, index) => {
    const duration = parseDecimalHours(extractTotalHours(chunks[index]) ?? '')
    if (!duration) return []
    return [{ data: date.iso, ...duration, detalhamento: extractDetails(chunks[index]), numeroObra }]
  })

  return { numeroObra, dias: parsedDays }
}

function itemPosition(item: TextItem) {
  const transform = Array.isArray(item.transform) ? item.transform : []
  return {
    x: typeof transform[4] === 'number' ? transform[4] : 0,
    y: typeof transform[5] === 'number' ? transform[5] : 0,
  }
}

function pageText(items: TextItem[]) {
  const rows = new Map<number, Array<{ x: number; text: string }>>()
  for (const item of items) {
    const text = item.str?.trim()
    if (!text) continue
    const { x, y } = itemPosition(item)
    const key = Math.round(y)
    rows.set(key, [...(rows.get(key) ?? []), { x, text }])
  }
  return Array.from(rows.entries())
    .sort(([left], [right]) => right - left)
    .map(([, row]) => row.sort((left, right) => left.x - right.x).map((item) => item.text).join(' '))
    .join('\n')
}

function pageItems(items: TextItem[]): RdoPage {
  return items.flatMap((item) => {
    const text = item.str?.trim()
    if (!text) return []
    const { x, y } = itemPosition(item)
    return [{ text, x, y }]
  })
}

export function parseRdoPages(pages: RdoPage[], options: ParseRdoOptions = {}): ParsedRdo {
  if (isMedicaoRdo(pages)) {
    const parsed = parseMedicaoRdoPages(pages, options)
    return {
      modelo: 'medicao',
      numeroObra: parsed.numeroObra,
      aviso: parsed.aviso,
      dias: parsed.dias.map(({ data, horas, minutos, detalhamento, numeroObra }) => ({ data, horas, minutos, detalhamento, numeroObra })),
    }
  }
  const text = pages.map((page, index) => `\n--- Página ${index + 1} ---\n${pageText(page.map((item) => ({ str: item.text, transform: [1, 0, 0, 1, item.x, item.y] })))}\n`).join('\n')
  return { modelo: 'padrao', ...parseRdoText(text) }
}

export async function parseRdo(file: File, options: ParseRdoOptions = {}): Promise<ParsedRdo> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  try {
    const pages: RdoPage[] = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      try {
        const content = await page.getTextContent()
        pages.push(pageItems(content.items as TextItem[]))
      } finally {
        page.cleanup()
      }
    }
    return parseRdoPages(pages, options)
  } finally {
    await pdf.cleanup()
  }
}
