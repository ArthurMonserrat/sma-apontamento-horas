import { describe, expect, it } from 'vitest'
import { parseRdoText } from './rdoParser'

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
})
