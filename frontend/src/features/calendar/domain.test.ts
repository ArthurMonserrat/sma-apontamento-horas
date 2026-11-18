import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from './types'
import type { TimeEntry } from '../time-entries/types'
import type { WorkloadVersion } from '../workloads/types'
import { calculateDaySummary, calculatePeriodSummary, getCalendarVisualState, getMonthGridCells, shiftMonth } from './domain'
import { calendarStatePresentation } from './presentation'

const collaboratorId = 'collaborator-1'
const workloadVersions: WorkloadVersion[] = [{
  id: 'workload-1',
  collaboratorId,
  dailyMinutes: 480,
  effectiveFrom: '2026-01-01',
  status: 'APPROVED',
  createdAt: '2025-12-01T12:00:00.000Z',
  approvedAt: '2025-12-02T12:00:00.000Z',
}]

function entry(date: string, durationMinutes: number, overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: `entry-${date}-${durationMinutes}`,
    collaboratorId,
    entryDate: date,
    clientName: 'Cliente 1',
    projectCode: 'SMA-001',
    activityId: 'activity-1',
    disciplineCode: '—',
    documentTypeCode: '—',
    durationMinutes,
    details: 'Atividade executada',
    assignmentSnapshot: null,
    status: 'ACTIVE',
    version: 1,
    createdAt: `${date}T12:00:00.000Z`,
    updatedAt: `${date}T12:00:00.000Z`,
    ...overrides,
  }
}

function event(type: CalendarEvent['type'], date: string, justifiedMinutes?: number): CalendarEvent {
  return {
    id: `event-${type}-${date}`,
    collaboratorId,
    type,
    startDate: date,
    endDate: date,
    justifiedMinutes,
    title: type,
    source: 'DEMO',
    createdAt: `${date}T10:00:00.000Z`,
  }
}

describe('saldos diários e eventos', () => {
  it.each([
    [540, 60, 480, 60, 0],
    [480, 0, 480, 0, 0],
    [360, -120, 360, 0, 120],
  ])('calcula %i minutos trabalhados com saldo %i', (worked, balance, regular, extra, missing) => {
    const summary = calculateDaySummary({
      date: '2026-07-20',
      today: '2026-07-20',
      collaboratorId,
      entries: [entry('2026-07-20', worked)],
      events: [],
      workloadVersions,
    })
    expect(summary).toMatchObject({ balanceMinutes: balance, regularMinutes: regular, extraMinutes: extra, missingMinutes: missing })
  })

  it.each(['HOLIDAY', 'VACATION', 'MEDICAL_LEAVE_FULL'] as const)('%s neutraliza integralmente a jornada', (type) => {
    const summary = calculateDaySummary({
      date: '2026-07-20', today: '2026-07-20', collaboratorId, entries: [],
      events: [event(type, '2026-07-20')], workloadVersions,
    })
    expect(summary).toMatchObject({ baseExpectedMinutes: 480, expectedMinutes: 0, justifiedMinutes: 480, balanceMinutes: 0, hasIntegralEventConflict: false })
  })

  it.each(['HOLIDAY', 'VACATION', 'MEDICAL_LEAVE_FULL'] as const)('%s neutraliza saldo de registro histórico conflitante sem apagar sua origem', (type) => {
    const historicalConflict = entry('2026-07-20', 480)
    const summary = calculateDaySummary({
      date: '2026-07-20', today: '2026-07-20', collaboratorId,
      entries: [historicalConflict], events: [event(type, '2026-07-20')], workloadVersions,
    })

    expect(summary).toMatchObject({
      expectedMinutes: 0,
      workedMinutes: 0,
      regularMinutes: 0,
      extraMinutes: 0,
      missingMinutes: 0,
      balanceMinutes: 0,
      hasIntegralEventConflict: true,
    })
    expect(historicalConflict).toMatchObject({ status: 'ACTIVE', durationMinutes: 480 })
  })

  it('afastamento parcial reduz somente a jornada justificada', () => {
    const summary = calculateDaySummary({
      date: '2026-07-20', today: '2026-07-20', collaboratorId,
      entries: [entry('2026-07-20', 300)],
      events: [event('MEDICAL_LEAVE_PARTIAL', '2026-07-20', 180)],
      workloadVersions,
    })
    expect(summary).toMatchObject({ expectedMinutes: 300, justifiedMinutes: 180, workedMinutes: 300, balanceMinutes: 0 })
  })

  it('preserva evento administrativo integral sem depender de solicitação interativa', () => {
    const summary = calculateDaySummary({
      date: '2026-07-21', today: '2026-07-21', collaboratorId, entries: [],
      events: [event('VACATION', '2026-07-21')], workloadVersions,
    })

    expect(summary).toMatchObject({ expectedMinutes: 0, balanceMinutes: 0, visualState: 'VACATION' })
  })

  it('ignora apontamento cancelado', () => {
    const summary = calculateDaySummary({
      date: '2026-07-20', today: '2026-07-20', collaboratorId,
      entries: [entry('2026-07-20', 480, { status: 'CANCELLED' })], events: [], workloadVersions,
    })
    expect(summary.workedMinutes).toBe(0)
  })
})

describe('saldos por período e calendário', () => {
  it('agrega mês, intervalo e total a partir dos resumos diários', () => {
    const result = calculatePeriodSummary({
      startDate: '2026-07-20', endDate: '2026-07-22', today: '2026-07-22', collaboratorId,
      entries: [entry('2026-07-20', 480), entry('2026-07-21', 540), entry('2026-07-22', 360)],
      events: [], workloadVersions,
    })
    expect(result).toMatchObject({ expectedMinutes: 1440, workedMinutes: 1380, realBalanceMinutes: -60, hasFutureDates: false })
  })

  it('exclui datas futuras de jornada, déficit e saldo real', () => {
    const result = calculatePeriodSummary({
      startDate: '2026-07-20', endDate: '2026-07-21', today: '2026-07-20', collaboratorId,
      entries: [entry('2026-07-20', 480)], events: [], workloadVersions,
    })
    expect(result.realBalanceMinutes).toBe(0)
    expect(result.expectedMinutes).toBe(480)
    expect(result.missingMinutes).toBe(0)
    expect(result.hasFutureDates).toBe(true)
    expect(result.days[1]).toMatchObject({ isFuture: true, expectedMinutes: 0, missingMinutes: 0, balanceMinutes: 0 })
    expect('projectedBalanceMinutes' in result).toBe(false)
  })

  it('mantém status de completude separado do status de aprovação', () => {
    const summary = calculateDaySummary({
      date: '2026-07-20', today: '2026-07-20', collaboratorId,
      entries: [entry('2026-07-20', 540)], events: [], workloadVersions,
    })
    expect(getCalendarVisualState(summary)).toEqual({ state: 'EXCEEDED', label: 'Jornada excedida' })
    expect('approvalStatus' in getCalendarVisualState(summary)).toBe(false)
  })

  it('usa o rotulo do catalogo compartilhado sem alterar o estado derivado', () => {
    const summary = calculateDaySummary({
      date: '2026-07-20', today: '2026-07-20', collaboratorId,
      entries: [], events: [event('HOLIDAY', '2026-07-20')], workloadVersions,
    })

    expect(summary.visualState).toBe('HOLIDAY')
    expect(getCalendarVisualState(summary)).toEqual({
      state: 'HOLIDAY',
      label: calendarStatePresentation.HOLIDAY.label,
    })
  })

  it('gera somente os dias de julho e placeholders para o alinhamento semanal', () => {
    const cells = getMonthGridCells('2026-07')
    const days = cells.filter((cell) => cell.kind === 'day')
    const placeholders = cells.filter((cell) => cell.kind === 'placeholder')

    expect(cells).toHaveLength(35)
    expect(days).toHaveLength(31)
    expect(placeholders).toHaveLength(4)
    expect(days[0]).toMatchObject({ date: '2026-07-01' })
    expect(days.at(-1)).toMatchObject({ date: '2026-07-31' })
    expect(cells.slice(0, 2).every((cell) => cell.kind === 'placeholder')).toBe(true)
    expect(cells.slice(-2).every((cell) => cell.kind === 'placeholder')).toBe(true)
  })

  it('não cria preenchimento inicial quando o mês começa na segunda-feira', () => {
    const cells = getMonthGridCells('2026-06')

    expect(cells[0]).toMatchObject({ kind: 'day', date: '2026-06-01' })
    expect(cells.filter((cell) => cell.kind === 'day')).toHaveLength(30)
    expect(cells.filter((cell) => cell.kind === 'placeholder')).toHaveLength(5)
  })

  it('usa placeholders sem datas adjacentes em um fevereiro iniciado no domingo', () => {
    const cells = getMonthGridCells('2026-02')
    const days = cells.filter((cell) => cell.kind === 'day')

    expect(days).toHaveLength(28)
    expect(days.every((cell) => cell.date.startsWith('2026-02'))).toBe(true)
    expect(cells.filter((cell) => cell.kind === 'placeholder')).toHaveLength(7)
  })

  it('navega entre meses atravessando o ano', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  })
})
