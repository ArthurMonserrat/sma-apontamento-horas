import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { projectsFromRows, readProjectWorkbook } from './projectExcelImport'

const header = ['Projeto', 'Supervisão', 'Executor', 'Cliente', 'Cliente Final', 'Local', 'Seg. Mercado', 'Descrição', 'Atividades', 'Complemento']

describe('importação de projetos do Excel', () => {
  it('agrupa as linhas por projeto e junta as atividades', () => {
    const preview = projectsFromRows([
      header,
      ['25A163E', 'S2-BAA', 'Bruna Alvarenga', 'APPIAN CAPITAL', 'APPIAN CAPITAL', 'Itagibá/BA', 'Mineração', 'Estudos ONS - Proj. Santa Rita', 'Curto-circuito', null],
      ['25a163e', 'S2-BAA', 'Sabrina Drumond', 'APPIAN CAPITAL', 'APPIAN CAPITAL', 'Itagibá/BA', 'Mineração', 'Estudos ONS - Proj. Santa Rita', 'Fluxo de Potência', ''],
      ['25A163E', 'S2-BAA', 'Sabrina Drumond', 'APPIAN CAPITAL', 'APPIAN CAPITAL', 'Itagibá/BA', 'Mineração', 'Estudos ONS - Proj. Santa Rita', 'Fluxo de Potência', ''],
      [],
      ['26A079S', 'S1-HTC', 'Giuliano Carnevali', 'AP', 'PETROBRAS', 'Ipojuca/PE', 'Óleo e gás', 'RNEST', 'Fluxo de Potência', 'Sistema Industrial (PTW) - uso IA'],
      ['', '', 'Sem projeto', 'X', '', '', '', '', 'Algo', ''],
    ])
    expect(preview.projects).toHaveLength(2)
    expect(preview.rows).toBe(4)
    expect(preview.skippedRows).toEqual([7])
    const [santaRita, rnest] = preview.projects
    expect(santaRita).toMatchObject({ code: '25A163E', supervisionCode: 'S2-BAA', client: 'APPIAN CAPITAL', location: 'Itagibá/BA', marketSegment: 'Mineração' })
    expect(santaRita.activities).toEqual([
      { name: 'Curto-circuito', complement: null, executorName: 'Bruna Alvarenga' },
      { name: 'Fluxo de Potência', complement: null, executorName: 'Sabrina Drumond' },
    ])
    expect(rnest).toMatchObject({ code: '26A079S', client: 'AP', finalClient: 'PETROBRAS' })
    expect(rnest.activities[0].complement).toBe('Sistema Industrial (PTW) - uso IA')
    expect(preview.executors).toEqual(['Bruna Alvarenga', 'Giuliano Carnevali', 'Sabrina Drumond'])
  })

  it('aceita cabeçalho fora da primeira linha e sem acento', () => {
    const preview = projectsFromRows([['Planilha de projetos'], ['PROJETO', 'CLIENTE', 'DESCRICAO'], ['26A087E', 'ARCELOR MITTAL', 'Estudo']])
    expect(preview.projects[0]).toMatchObject({ code: '26A087E', client: 'ARCELOR MITTAL', description: 'Estudo', activities: [] })
  })

  it('explica quando faltam colunas obrigatórias', () => {
    expect(() => projectsFromRows([['Nome', 'Valor']])).toThrow('coluna "Projeto"')
    expect(() => projectsFromRows([['Projeto', 'Descrição'], ['A1', 'x']])).toThrow('coluna "Cliente"')
    expect(() => projectsFromRows([header])).toThrow('não tem projetos')
  })

  it('lê um arquivo .xlsx', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Planilha1')
    sheet.addRow(header)
    sheet.addRow(['25EV003E', 'S2-BAA', 'Bruna Alvarenga', 'ENEVA', 'ENEVA', 'Itaqui/MA', 'Energia', 'Estudos', 'Seletividade', 'Proteção'])
    const buffer = await workbook.xlsx.writeBuffer()
    const preview = await readProjectWorkbook(new Blob([buffer]))
    expect(preview.projects[0]).toMatchObject({ code: '25EV003E', client: 'ENEVA', activities: [{ name: 'Seletividade', complement: 'Proteção', executorName: 'Bruna Alvarenga' }] })
  })

  it('recusa arquivo que não é Excel', async () => {
    await expect(readProjectWorkbook(new Blob(['texto']))).rejects.toThrow('Não foi possível ler o arquivo')
  })
})
