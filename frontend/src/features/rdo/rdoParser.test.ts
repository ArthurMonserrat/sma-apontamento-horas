import { describe, expect, it } from 'vitest'
import { parseRdoPages, parseRdoText, type RdoPage } from './rdoParser'

describe('leitor de RDO', () => {
  it('extrai projeto, horas e detalhamento por dia', () => {
    const result = parseRdoText(`
      Obra 25M020E
      Data OS 28/07/2026
      DESCRIÇÃO DA ATIVIDADE E DO LOCAL
      07:30 12:30 Levantamento de campo.
      Total de Horas 8.5
      Assinatura do responsável
    `)

    expect(result.numeroObra).toBe('25M020E')
    expect(result.dias).toEqual([{
      data: '2026-07-28',
      horas: 8,
      minutos: 30,
      detalhamento: '[07:30 - 12:30] Levantamento de campo.',
      numeroObra: '25M020E',
    }])
  })

  it('separa dias e mantém as horas de cada trecho', () => {
    const result = parseRdoText(`
      Obra 25M020E
      Data 28/07/2026
      Total de Horas 5
      Data 29/07/2026
      Total de Horas 9.25
    `)

    expect(result.dias.map((day) => [day.data, day.horas, day.minutos])).toEqual([
      ['2026-07-28', 5, 0],
      ['2026-07-29', 9, 15],
    ])
  })

  it('lê o modelo de RDO por profissional e restringe as horas ao usuário informado', () => {
    const page: RdoPage = [
      { text: 'NÚMERO DA OBRA (CENTRO CUSTO SM&A):', x: 100, y: 100 },
      { text: '25M020E', x: 100, y: 90 },
      { text: 'DATA DA ATIVIDADE (DD/MM/AA):', x: 20, y: 100 },
      { text: '28/07/2026', x: 20, y: 80 },
      { text: 'NOME DO PROFISSIONAL', x: 100, y: 60 },
      { text: 'HORAS NORMAIS', x: 300, y: 60 },
      { text: 'INICIO', x: 200, y: 50 },
      { text: 'TERMINO', x: 250, y: 50 },
      { text: 'Ana Souza - Técnica', x: 100, y: 40 },
      { text: '08:00', x: 200, y: 40 },
      { text: '17:00', x: 250, y: 40 },
      { text: '08:00', x: 300, y: 40 },
      { text: 'EQUIPAMENTO', x: 100, y: 30 },
      { text: 'PRINCIPAIS ATIVIDADES E COMENTÁRIOS', x: 100, y: 20 },
      { text: '- Levantamento de campo.', x: 100, y: 10 },
      { text: 'ASSINATURAS / VALIDAÇÃO DO DOCUMENTO', x: 100, y: 0 },
    ]

    const result = parseRdoPages([page], { collaboratorName: 'Ana Souza' })
    expect(result.modelo).toBe('medicao')
    expect(result.numeroObra).toBe('25M020E')
    expect(result.dias[0]).toMatchObject({ data: '2026-07-28', horas: 8, minutos: 0 })
  })
})
