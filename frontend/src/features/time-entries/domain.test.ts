import { describe, expect, it } from 'vitest'
import { demoActivities } from '../../demo/fixtures/demoData'
import type { CreateTimeEntryData } from './types'
import {
  areValidDurationParts,
  expandTimeEntryDates,
  formatMinutes,
  formatSignedMinutes,
  isValidDuration,
  validateTimeEntry,
} from './domain'

const monday = '2026-07-13'
describe('validações e formatação', () => {
  it('expõe exatamente as vinte atividades de trabalho na ordem aprovada', () => {
    expect(demoActivities.map((activity) => activity.name)).toEqual([
      'Análise de documento',
      'Apoio a colaborador',
      'Apoio propostas',
      'Apontamento de projeto — acompanhamento',
      'ASO — mobilização',
      'Atendimento de comentários do cliente',
      'Atendimento de comentários internos',
      'Elaboração de projeto',
      'Emissão de documento',
      'Gerenciamento e cronograma',
      'Levantamento de campo',
      'Levantamento de dados para início de atividade',
      'Modelo 3D',
      'Ociosidade',
      'Ociosidade por TI',
      'Reunião com cliente',
      'Reunião interna',
      'Treinamentos',
      'Verificação de documento',
      'Outros',
    ])
  })

  it('mantém eventos administrativos fora do catálogo criável', () => {
    const names = demoActivities.map((activity) => activity.name)

    expect(names).not.toContain('Férias')
    expect(names).not.toContain('Afastamentos médicos')
    expect(names).not.toContain('Feriado/emenda')
    expect(names).not.toContain('Folga compensação de horas')
  })

  it('rejeita duração igual a zero', () => expect(isValidDuration(0)).toBe(false))
  it('rejeita duração negativa', () => expect(isValidDuration(-1)).toBe(false))
  it('rejeita duração superior a 24 horas', () => expect(isValidDuration(1441)).toBe(false))
  it('aceita partes válidas de horas e minutos', () => expect(areValidDurationParts(1, 30)).toBe(true))
  it('rejeita 60 no campo de minutos', () => expect(areValidDurationParts(1, 60)).toBe(false))
  it('rejeita parte fracionária no campo de horas', () => expect(areValidDurationParts(1.5, 0)).toBe(false))
  it('rejeita minutos adicionais quando as horas já atingiram 24', () => expect(areValidDurationParts(24, 1)).toBe(false))

  const validData = {
    entryDate: monday,
    clientName: 'Cliente Industrial Alfa',
    projectCode: 'Ab-001/2.03',
    activityId: 'activity-project-design',
    disciplineCode: '—',
    documentTypeCode: '—',
    durationMinutes: 60,
    details: 'Atividade corporativa',
  } as CreateTimeEntryData

  it('rejeita cliente vazio após remover espaços externos', () => {
    const errors = validateTimeEntry({ ...validData, clientName: '   ' }, demoActivities)
    expect(errors.clientName).toBe('Informe o cliente.')
  })

  it('aceita cliente textual informado manualmente', () => {
    const errors = validateTimeEntry({ ...validData, clientName: '  Cliente Manual  ' }, demoActivities)
    expect(errors.clientName).toBeUndefined()
  })

  it('rejeita número da contratada composto somente por espaços', () => {
    const errors = validateTimeEntry(
      { ...validData, projectCode: '   ' },
      demoActivities,
    )
    expect(errors.projectCode).toBe('Informe o número da contratada.')
  })

  it('aceita número da contratada com 80 caracteres após trim', () => {
    const errors = validateTimeEntry(
      { ...validData, projectCode: `  ${'A'.repeat(80)}  ` },
      demoActivities,
    )
    expect(errors.projectCode).toBeUndefined()
  })

  it('rejeita número da contratada acima de 80 caracteres após trim', () => {
    const errors = validateTimeEntry(
      { ...validData, projectCode: `  ${'A'.repeat(81)}  ` },
      demoActivities,
    )
    expect(errors.projectCode).toBe('O número da contratada deve ter no máximo 80 caracteres.')
  })

  it('bloqueia data futura no fuso corporativo', () => {
    const errors = validateTimeEntry(
      { ...validData, entryDate: '2026-07-21' },
      demoActivities,
      { today: '2026-07-20', canMutateDate: true },
    )
    expect(errors.entryDate).toBe('Não é permitido apontar horas em uma data futura.')
  })

  it('bloqueia competência fechada e permite período reaberto', () => {
    const blocked = validateTimeEntry(validData, demoActivities, { today: '2026-07-20', canMutateDate: false })
    const reopened = validateTimeEntry(validData, demoActivities, { today: '2026-07-20', canMutateDate: true })
    expect(blocked.entryDate).toBe('Esta data está aprovada ou fora de uma competência aberta.')
    expect(reopened.entryDate).toBeUndefined()
  })

  it('exige seleção explícita de disciplina e aceita não se aplica', () => {
    const missing = validateTimeEntry({ ...validData, disciplineCode: '' as '—' }, demoActivities)
    const notApplicable = validateTimeEntry({ ...validData, disciplineCode: '—' }, demoActivities)
    expect(missing.disciplineCode).toBe('Selecione uma disciplina.')
    expect(notApplicable.disciplineCode).toBeUndefined()
  })

  it('exige seleção explícita de tipo de documento e aceita não se aplica', () => {
    const missing = validateTimeEntry({ ...validData, documentTypeCode: '' as '—' }, demoActivities)
    const notApplicable = validateTimeEntry({ ...validData, documentTypeCode: '—' }, demoActivities)
    expect(missing.documentTypeCode).toBe('Selecione um tipo de documento.')
    expect(notApplicable.documentTypeCode).toBeUndefined()
  })

  it('aceita detalhamento vazio inclusive em Outros', () => {
    expect(validateTimeEntry({ ...validData, details: '   ', activityId: 'activity-other' }, demoActivities)).toEqual({})
  })

  it.each(['G', 'M'] as const)('aceita disciplina %s', (disciplineCode) => {
    expect(validateTimeEntry({ ...validData, disciplineCode }, demoActivities)).toEqual({})
  })

  it('formata minutos positivos em HH:MM', () => expect(formatMinutes(125)).toBe('02:05'))
  it('formata saldo negativo', () => expect(formatSignedMinutes(-90)).toBe('-01:30'))

  it('expande períodos em dias úteis e preserva lançamento único', () => {
    expect(expandTimeEntryDates('2026-07-13', '2026-07-13')).toEqual(['2026-07-13'])
    expect(expandTimeEntryDates('2026-07-13', '2026-07-19')).toEqual(['2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17'])
    expect(expandTimeEntryDates('2026-07-13', '2026-07-19', false)).toHaveLength(7)
  })
})
