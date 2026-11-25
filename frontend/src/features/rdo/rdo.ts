import { jsPDF } from 'jspdf'
import { AlignmentType, Document, HeadingLevel, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx'
import { areValidDurationParts, formatMinutes } from '../time-entries/domain'
import { formatDatePtBr, isIsoDate } from '../../shared/lib/date'

type RdoFormData = {
  entryDate?: string
  startDate?: string
  contractorNumber: string
  primaryCode?: string
  secondaryCode?: string
  funcaoContrato?: string
  hours: string
  minutes: string
  details: string
}
type RdoContext = { name: string; jobTitle?: string; activityName?: string; assinaturaBase64?: string }
export type RdoData = ReturnType<typeof buildRdoData>

type DecodedSignature = {
  bytes: Uint8Array
  format: 'PNG' | 'JPEG'
}

const SIGNATURE_DATA_URL_PATTERN = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/

function decodeSignatureDataUrl(signatureBase64?: string): DecodedSignature | null {
  if (!signatureBase64) return null
  const match = SIGNATURE_DATA_URL_PATTERN.exec(signatureBase64)
  if (!match) return null
  const binary = atob(match[2])
  return {
    bytes: Uint8Array.from(binary, (char) => char.charCodeAt(0)),
    format: match[1] === 'jpeg' ? 'JPEG' : 'PNG',
  }
}

export function buildRdoData(values: RdoFormData, context: RdoContext) {
  const entryDate = values.entryDate ?? values.startDate ?? ''
  if (!isIsoDate(entryDate)) throw new Error('Informe uma data válida para criar o RDO.')
  const hours = Number(values.hours || 0), minutes = Number(values.minutes || 0)
  if (!areValidDurationParts(hours, minutes)) throw new Error('Informe uma duração válida para criar o RDO.')
  if (!values.contractorNumber.trim()) throw new Error('Informe o número do projeto ou da obra para criar o RDO.')
  return {
    contractor: 'SM&A Sistemas Elétricos e Automação',
    contractorNumber: values.contractorNumber.trim(),
    date: entryDate, professional: context.name, category: values.funcaoContrato?.trim() || context.jobTitle || '',
    duration: formatMinutes(hours * 60 + minutes),
    primaryCode: values.primaryCode?.trim() ?? '',
    secondaryCode: values.secondaryCode?.trim() ?? '',
    activity: context.activityName ?? '', details: values.details.trim(),
    assinaturaBase64: context.assinaturaBase64,
  }
}

export function rdoFileName(data: RdoData) {
  const safe = (value: string) => [...value].map((char) => char.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(char) ? '_' : char).join('').replace(/[. ]+$/g, '').slice(0, 70)
  return ['RDO', data.date, safe(data.contractorNumber), safe(data.primaryCode)].filter(Boolean).join('_') + '.pdf'
}

export function rdoWordFileName(data: RdoData) {
  return rdoFileName(data).replace(/\.pdf$/i, '.docx')
}

function wordCell(label: string, value: string) {
  return new TableCell({
    children: [
      new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 18 })] }),
      new Paragraph({ children: [new TextRun({ text: value || '—', size: 20 })] }),
    ],
  })
}

export function generateRdoWord(data: RdoData) {
  const identification = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [wordCell('Contratada', data.contractor), wordCell('Projeto / obra', data.contractorNumber), wordCell('Data', formatDatePtBr(data.date))] }),
      new TableRow({ children: [wordCell('Código primário', data.primaryCode), wordCell('Código secundário', data.secondaryCode), wordCell('Total de horas', data.duration)] }),
    ],
  })
  const body = [
    new Paragraph({ text: 'RELATÓRIO DIÁRIO DE OBRA', heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
    new Paragraph({ text: 'Apontamento individual do colaborador', alignment: AlignmentType.CENTER }),
    new Paragraph({ text: '' }),
    identification,
    new Paragraph({ text: '' }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({ children: [wordCell('Nome do profissional', data.professional), wordCell('Função contratual', data.category)] })],
    }),
    new Paragraph({ text: '' }),
    new Paragraph({ children: [new TextRun({ text: 'ATIVIDADE REALIZADA', bold: true })] }),
    new Paragraph({ text: data.activity || '—' }),
    new Paragraph({ children: [new TextRun({ text: 'DETALHAMENTO DAS ATIVIDADES', bold: true })] }),
    new Paragraph({ text: data.details || '—' }),
    new Paragraph({ text: '' }),
    new Paragraph({ text: 'ASSINATURA DO RESPONSÁVEL', alignment: AlignmentType.CENTER }),
    new Paragraph({ text: data.professional, alignment: AlignmentType.CENTER }),
  ]
  return new Document({ sections: [{ properties: {}, children: body }] })
}

export function generateRdo(data: RdoData, logo: Uint8Array) {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: false })
  pdf.setProperties({ title: 'Relatório Diário de Obra', author: 'SM&A Sistemas Elétricos e Automação' })
  const margin = 12
  const width = pdf.internal.pageSize.getWidth() - margin * 2
  const bottom = pdf.internal.pageSize.getHeight() - 14
  const lineHeight = 4
  const signature = decodeSignatureDataUrl(data.assinaturaBase64)

  const drawHeader = () => {
    pdf.setDrawColor(75)
    pdf.setLineWidth(0.25)
    pdf.rect(margin, 12, width, 24)
    pdf.line(margin + 62, 12, margin + 62, 36)
    pdf.line(margin + width - 55, 12, margin + width - 55, 36)

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    pdf.setTextColor(35)
    pdf.text('SM&A SISTEMAS ELÉTRICOS', margin + 31, 24, { align: 'center' })

    const image = pdf.getImageProperties(logo)
    const logoWidth = 39
    const logoHeight = logoWidth * image.height / image.width
    pdf.addImage(logo, 'JPEG', margin + width - 47, 18, logoWidth, logoHeight)

    pdf.setFontSize(13)
    pdf.text('RELATÓRIO DIÁRIO DE OBRA', margin + width / 2, 22.5, { align: 'center' })
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.text('Apontamento individual do colaborador', margin + width / 2, 28, { align: 'center' })
  }

  const drawSection = (label: string, y: number) => {
    pdf.setFillColor(231, 237, 240)
    pdf.setDrawColor(75)
    pdf.rect(margin, y, width, 7, 'FD')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    pdf.setTextColor(25)
    pdf.text(label, margin + 2.5, y + 4.7)
    return y + 7
  }

  const drawRow = (y: number, cells: Array<{ label: string; value: string; width: number }>) => {
    const prepared = cells.map((cell) => ({ ...cell, lines: pdf.splitTextToSize(cell.value || ' ', cell.width - 5) as string[] }))
    const height = Math.max(11, ...prepared.map((cell) => 6 + cell.lines.length * lineHeight))
    let x = margin
    pdf.setDrawColor(75)
    for (const cell of prepared) {
      pdf.rect(x, y, cell.width, height)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(6.5)
      pdf.setTextColor(80)
      pdf.text(cell.label, x + 2, y + 3.6)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      pdf.setTextColor(20)
      pdf.text(cell.lines, x + 2, y + 7.5)
      x += cell.width
    }
    return y + height
  }

  const drawIdentification = () => {
    let y = 40
    y = drawRow(y, [
      { label: 'Contratada', value: data.contractor, width: 96 },
      { label: 'Número do projeto / obra', value: data.contractorNumber, width: 91 },
      { label: 'Data', value: formatDatePtBr(data.date), width: width - 187 },
    ])
    y = drawRow(y, [
      { label: 'Código primário', value: data.primaryCode, width: width / 2 },
      { label: 'Código secundário', value: data.secondaryCode, width: width / 2 },
    ])
    y = drawSection('PROFISSIONAL', y)
    y = drawRow(y, [
      { label: 'Nome do profissional', value: data.professional, width: 127 },
      { label: 'Categoria / Função', value: data.category, width: 100 },
      { label: 'Total de horas', value: data.duration, width: width - 227 },
    ])
    return y
  }

  const drawSignatureBlock = (y: number) => {
    const center = margin + width / 2
    const blockY = Math.min(y + 8, bottom - 23)
    const lineY = blockY + 17
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(6.5)
    pdf.setTextColor(80)
    pdf.text('ASSINATURA DO RESPONSÁVEL', center, blockY, { align: 'center' })
    if (signature) {
      const image = pdf.getImageProperties(signature.bytes)
      const maxSignatureWidth = 56
      const maxSignatureHeight = 14
      const imageRatio = image.width / image.height
      const signatureWidth = Math.min(maxSignatureWidth, maxSignatureHeight * imageRatio)
      const signatureHeight = signatureWidth / imageRatio
      pdf.addImage(signature.bytes, signature.format, center - signatureWidth / 2, lineY - signatureHeight - 1, signatureWidth, signatureHeight)
    }
    pdf.setDrawColor(80)
    pdf.line(center - 38, lineY, center + 38, lineY)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    pdf.setTextColor(45)
    pdf.text(data.professional, center, lineY + 4.5, { align: 'center' })
  }

  const details = data.details ? pdf.splitTextToSize(data.details, width - 6) as string[] : []
  const pending = details.length ? [...details] : [' ']
  let page = 0
  do {
    if (page > 0) pdf.addPage('a4', 'landscape')
    drawHeader()
    let y = drawIdentification()
    y = drawSection(page === 0 ? 'DADOS DO APONTAMENTO' : 'DADOS DO APONTAMENTO - CONTINUAÇÃO', y)
    y = drawRow(y, [
      { label: 'ATIVIDADE REALIZADA', value: data.activity, width },
    ])
    const availableLines = Math.max(1, Math.floor((bottom - y - 38) / lineHeight))
    const pageLines = pending.splice(0, availableLines)
    const detailHeight = Math.max(18, 7 + pageLines.length * lineHeight)
    pdf.setDrawColor(75)
    pdf.rect(margin, y, width, detailHeight)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(6.5)
    pdf.setTextColor(80)
    pdf.text('DETALHAMENTO DAS ATIVIDADES', margin + 2, y + 3.6)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(20)
    pdf.text(pageLines, margin + 2, y + 8)
    if (pending.length === 0) drawSignatureBlock(y + detailHeight)
    page += 1
  } while (pending.length)

  const pages = pdf.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i)
    pdf.setDrawColor(150)
    pdf.line(margin, 199, margin + width, 199)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    pdf.setTextColor(90)
    pdf.text('Documento demonstrativo gerado pelo sistema SM&A', margin, 204)
    pdf.text(`Página ${i} de ${pages}`, margin + width, 204, { align: 'right' })
  }
  return pdf
}

export function downloadRdo(pdf: jsPDF, name: string) {
  const blob = pdf.output('blob')
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url; link.download = name
  document.body.appendChild(link)
  link.click(); link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
