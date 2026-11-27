import { describe, expect, it } from 'vitest'
import { normalizeCreateData } from './timeEntryValidation'
import type { CreateTimeEntryData } from '../types'

const validData: CreateTimeEntryData = {
  entryDate: '2026-11-27',
  contractorNumber: 'PROJ-01',
  activityId: 'activity-project-design',
  startTime: '08:00',
  endTime: '17:00',
  durationMinutes: 540,
  details: '',
}

describe('validação de persistência dos horários', () => {
  it('recusa apontamento sem início e fim', () => {
    expect(() => normalizeCreateData({ ...validData, startTime: '', endTime: '' })).toThrow('Informe a hora de início e a hora de fim.')
  })

  it('recusa intervalo inválido', () => {
    expect(() => normalizeCreateData({ ...validData, endTime: '07:59' })).toThrow('Informe um intervalo de horas válido.')
  })

  it('preserva o intervalo válido após limpar os campos', () => {
    expect(normalizeCreateData({ ...validData, startTime: ' 08:00 ', endTime: ' 17:00 ' })).toMatchObject({ startTime: '08:00', endTime: '17:00' })
  })
})
