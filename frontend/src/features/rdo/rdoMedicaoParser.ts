/**
 * Leitor do modelo de RDO "Relatório Diário de Obra" em planilha (ex.: ArcelorMittal).
 * Esse modelo tem uma página por dia, uma tabela de profissionais com colunas de
 * horário e o quantitativo de horas (normais e extraordinárias) por profissional.
 * A leitura é feita pela posição dos textos na página, porque a ordem do texto
 * extraído do PDF mistura as colunas.
 */

export type RdoTextItem = { text: string; x: number; y: number }
export type RdoPage = RdoTextItem[]

export type ParsedMedicaoDay = {
  data: string
  horas: number
  minutos: number
  detalhamento: string
  numeroObra: string
  profissional: string
}

export type ParsedMedicaoRdo = {
  numeroObra?: string
  numeroContrato?: string
  cliente?: string
  dias: ParsedMedicaoDay[]
  profissionais: string[]
  aviso?: string
}

const TIME = /^(\d{1,2}):(\d{2})$/
const DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/
const NAME_STOPWORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])

export function normalizeRdoText(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()
}

function findItem(page: RdoPage, predicate: (normalized: string) => boolean) {
  return page.find((item) => predicate(normalizeRdoText(item.text)))
}

function findAll(page: RdoPage, predicate: (normalized: string) => boolean) {
  return page.filter((item) => predicate(normalizeRdoText(item.text)))
}

export function isMedicaoRdo(pages: RdoPage[]) {
  return pages.some((page) => Boolean(findItem(page, (text) => text.startsWith('NUMERO DA OBRA (CENTRO CUSTO'))))
}

/** Valor logo abaixo de um cabeçalho, na mesma coluna. */
function valueBelow(page: RdoPage, header: RdoTextItem | undefined, maxDistance = 20) {
  if (!header) return undefined
  return page
    .filter((item) => item !== header && item.y < header.y && header.y - item.y <= maxDistance && Math.abs(item.x - header.x) <= 8)
    .sort((left, right) => right.y - left.y)[0]?.text.trim() || undefined
}

function timeToMinutes(value: string) {
  const match = value.trim().match(TIME)
  if (!match) return null
  const minutes = Number(match[2])
  if (minutes > 59) return null
  return Number(match[1]) * 60 + minutes
}

function padTime(value: string) {
  return value.trim().padStart(5, '0')
}

function toIsoDate(value: string) {
  const match = value.trim().match(DATE)
  return match ? `${match[3]}-${match[2]}-${match[1]}` : undefined
}

function professionalName(text: string) {
  return text.split(' - ')[0].trim()
}

function nameTokens(name: string) {
  return normalizeRdoText(name).split(' ').filter((token) => token.length > 1 && !NAME_STOPWORDS.has(token.toLowerCase()))
}

/** Todas as palavras do nome do usuário aparecem no nome do profissional (ex.: "Hugo Barbosa" ⊂ "Hugo Campelo Barbosa"). */
export function rdoNameMatches(collaboratorName: string, rdoName: string) {
  const wanted = nameTokens(collaboratorName)
  if (wanted.length === 0) return false
  const available = new Set(nameTokens(professionalName(rdoName)))
  return wanted.every((token) => available.has(token))
}

type ProfessionalRow = { name: string; times: Array<{ column: string; value: string }> }

function readProfessionalRows(page: RdoPage): ProfessionalRow[] {
  const normalHeader = findItem(page, (text) => text === 'HORAS NORMAIS')
  const extraHeader = findItem(page, (text) => text.startsWith('HORAS EXTRA'))
  const tableHeader = findItem(page, (text) => text === 'NOME DO PROFISSIONAL')
  const equipmentHeader = findItem(page, (text) => text === 'EQUIPAMENTO')
  if (!normalHeader || !tableHeader) return []

  // Cabeçalhos "Início/Término" ficam entre o título da tabela e a primeira linha de profissionais.
  const timeHeaders = findAll(page, (text) => text === 'INICIO' || text === 'TERMINO')
    .filter((item) => item.y < tableHeader.y && tableHeader.y - item.y <= 20)
    .sort((left, right) => left.x - right.x)
  const columns = [
    ...timeHeaders.map((item, index) => ({ column: `periodo-${index}`, x: item.x })),
    { column: 'normais', x: normalHeader.x },
    ...(extraHeader ? [{ column: 'extras', x: extraHeader.x }] : []),
  ]
  const firstTimeColumnX = Math.min(...columns.map((column) => column.x))
  const lowestHeaderY = Math.min(tableHeader.y, normalHeader.y, ...timeHeaders.map((item) => item.y))
  const bottomY = equipmentHeader?.y ?? -Infinity

  const names = page.filter((item) => {
    const text = normalizeRdoText(item.text)
    return item.y < lowestHeaderY - 1
      && item.y > bottomY
      && item.x < firstTimeColumnX - 10
      && !TIME.test(item.text.trim())
      && !['EFETIVO', 'DIRETO', 'INDIRETO'].includes(text)
      && /[A-Z]{2,}/.test(text)
  })

  return names
    .sort((left, right) => right.y - left.y)
    .map((name) => ({
      name: name.text.trim(),
      times: page
        .filter((item) => TIME.test(item.text.trim()) && Math.abs(item.y - name.y) <= 3 && item.x >= firstTimeColumnX - 15)
        .map((item) => {
          const nearest = [...columns].sort((left, right) => Math.abs(left.x - item.x) - Math.abs(right.x - item.x))[0]
          return { column: nearest.column, value: item.text.trim() }
        }),
    }))
}

function readDate(page: RdoPage) {
  const header = findItem(page, (text) => text.startsWith('DATA DA ATIVIDADE'))
  const dates = page.filter((item) => DATE.test(item.text.trim()))
  if (header) {
    const near = dates
      .filter((item) => item.y < header.y && header.y - item.y <= 40)
      .sort((left, right) => right.y - left.y)[0]
    if (near) return toIsoDate(near.text)
  }
  const top = [...dates].sort((left, right) => right.y - left.y)[0]
  return top ? toIsoDate(top.text) : undefined
}

function readActivities(page: RdoPage) {
  const header = findItem(page, (text) => text.startsWith('PRINCIPAIS ATIVIDADES'))
  if (!header) return ''
  const footer = findItem(page, (text) => text.startsWith('ASSINATURAS'))
  const bottomY = footer?.y ?? -Infinity
  const lines = new Map<number, RdoTextItem[]>()
  page
    .filter((item) => item.y < header.y - 1 && item.y > bottomY)
    .filter((item) => {
      const text = normalizeRdoText(item.text)
      return text && text !== 'SM&A' && text !== 'CONTRATANTE' && !DATE.test(item.text.trim())
    })
    .forEach((item) => {
      const key = Math.round(item.y)
      lines.set(key, [...(lines.get(key) ?? []), item])
    })

  const bullets: string[] = []
  Array.from(lines.entries())
    .sort(([left], [right]) => right - left)
    .map(([, items]) => items.sort((left, right) => left.x - right.x).map((item) => item.text.trim()).join(' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .forEach((line) => {
      if (line.startsWith('-') || bullets.length === 0) bullets.push(line)
      else bullets[bullets.length - 1] = `${bullets[bullets.length - 1]} ${line}`
    })
  return bullets.join('\n')
}

function describeJourney(times: ProfessionalRow['times']) {
  const periods = times
    .filter((time) => time.column.startsWith('periodo-'))
    .sort((left, right) => left.column.localeCompare(right.column))
    .map((time) => padTime(time.value))
  const pairs: string[] = []
  for (let index = 0; index + 1 < periods.length; index += 2) pairs.push(`${periods[index]} - ${periods[index + 1]}`)
  return pairs.length ? `Jornada: ${pairs.join(' | ')}` : ''
}

export function parseMedicaoRdoPages(pages: RdoPage[], options: { collaboratorName?: string } = {}): ParsedMedicaoRdo {
  const firstPage = pages.find((page) => findItem(page, (text) => text.startsWith('NUMERO DA OBRA (CENTRO CUSTO'))) ?? []
  const numeroObra = valueBelow(firstPage, findItem(firstPage, (text) => text.startsWith('NUMERO DA OBRA (CENTRO CUSTO')))
  const numeroContrato = valueBelow(firstPage, findItem(firstPage, (text) => text.startsWith('NUMERO DO CONTRATO')))
  const cliente = valueBelow(firstPage, findItem(firstPage, (text) => text.startsWith('CONTRATANTE / CLIENTE')))

  const pageData = pages.map((page) => ({ date: readDate(page), rows: readProfessionalRows(page), activities: readActivities(page) }))
  const profissionais = Array.from(new Set(pageData.flatMap((page) => page.rows.map((row) => row.name))))

  const collaboratorName = options.collaboratorName?.trim()
  const hasMatch = Boolean(collaboratorName) && profissionais.some((name) => rdoNameMatches(collaboratorName!, name))
  const singleProfessional = Array.from(new Set(profissionais.map(professionalName))).length === 1
  if (!hasMatch && !singleProfessional) {
    return {
      numeroObra,
      numeroContrato,
      cliente,
      dias: [],
      profissionais,
      aviso: collaboratorName
        ? `Seu nome (${collaboratorName}) não foi encontrado entre os profissionais do RDO: ${profissionais.map(professionalName).join(', ')}.`
        : 'Não foi possível identificar o profissional logado para ler as horas do RDO.',
    }
  }

  const dias = pageData.flatMap(({ date, rows, activities }) => {
    const row = rows.find((candidate) => (hasMatch ? rdoNameMatches(collaboratorName!, candidate.name) : true))
    if (!date || !row) return []
    const normal = timeToMinutes(row.times.find((time) => time.column === 'normais')?.value ?? '') ?? 0
    const extra = timeToMinutes(row.times.find((time) => time.column === 'extras')?.value ?? '') ?? 0
    const total = normal + extra
    if (total <= 0 || total > 24 * 60) return []
    const journey = describeJourney(row.times)
    const detalhamento = [journey, activities].filter(Boolean).join('\n') || 'Atividades importadas do RDO.'
    return [{
      data: date,
      horas: Math.floor(total / 60),
      minutos: total % 60,
      detalhamento,
      numeroObra: numeroObra ?? '',
      profissional: professionalName(row.name),
    }]
  })

  return { numeroObra, numeroContrato, cliente, dias, profissionais }
}


