import { describe, expect, it } from 'vitest'
import { collaboratorHours, filterRows, formatHours, generalActivityHours, hoursKpis, projectHours, teamHours } from './hoursReportModel'
import { hoursRowFromDb } from './hoursReportService'
import type { HoursReportRow } from './types'

const base: HoursReportRow = {
  collaboratorId: 'sabrina', collaboratorName: 'Sabrina Drumond', jobTitle: 'Engenheiro', teamId: 't1', teamName: 'Estudos',
  projectId: 'p1', projectCode: '25A163E', projectDescription: 'Santa Rita', projectClient: 'APPIAN',
  projectActivityId: 'a1', projectActivityName: 'Fluxo de Potência', projectActivityComplement: null,
  entryProjectCode: '25A163E', entryClient: 'APPIAN', activityId: 'activity-document-analysis', status: 'APPROVED', minutes: 480, entries: 1, days: 1,
}
const rows: HoursReportRow[] = [
  base,
  { ...base, status: 'PENDING', minutes: 240 },
  { ...base, collaboratorId: 'alan', collaboratorName: 'Alan Franklin', projectActivityId: 'a2', projectActivityName: 'Curto-circuito', projectActivityComplement: 'ONS', minutes: 120 },
  { ...base, collaboratorId: 'alan', collaboratorName: 'Alan Franklin', projectId: null, projectCode: null, projectDescription: null, projectClient: null, projectActivityId: null, projectActivityName: null, entryProjectCode: ' ex-01 ', entryClient: 'VALE', activityId: 'outra', minutes: 60 },
  { ...base, collaboratorId: 'bruno', collaboratorName: 'Bruno', teamId: null, teamName: null, status: 'REJECTED', minutes: 600 },
]
const names = (id: string) => id === 'activity-document-analysis' ? 'Análise de documento' : id

describe('relatório de horas', () => {
  it('filtra por situação e supervisão', () => {
    expect(filterRows(rows, { status: 'validas' })).toHaveLength(4)
    expect(filterRows(rows, { status: 'aprovadas' }).map((row) => row.minutes)).toEqual([480, 120, 60])
    expect(filterRows(rows, { status: 'pendentes' }).map((row) => row.minutes)).toEqual([240])
    expect(filterRows(rows, { status: 'rejeitadas', teamName: 'Sem supervisão' })).toHaveLength(1)
  })

  it('horas por projeto com atividades e pessoas', () => {
    const projects = projectHours(filterRows(rows, { status: 'validas' }), names)
    expect(projects.map((project) => [project.code, project.registered, project.minutes])).toEqual([['25A163E', true, 840], ['EX-01', false, 60]])
    const [santaRita, other] = projects
    expect(santaRita).toMatchObject({ label: '25A163E — Santa Rita', approvedMinutes: 600, pendingMinutes: 240, client: 'APPIAN' })
    expect(santaRita.activities).toEqual([
      { key: 'a1', label: 'Fluxo de Potência', minutes: 720, approvedMinutes: 480, people: [{ id: 'sabrina', label: 'Sabrina Drumond', minutes: 720 }] },
      { key: 'a2', label: 'Curto-circuito — ONS', minutes: 120, approvedMinutes: 120, people: [{ id: 'alan', label: 'Alan Franklin', minutes: 120 }] },
    ])
    expect(other).toMatchObject({ client: 'VALE', activities: [{ label: 'outra', minutes: 60 }] })
  })

  it('horas por colaborador, supervisão e atividade geral', () => {
    const valid = filterRows(rows, { status: 'validas' })
    expect(collaboratorHours(valid)).toEqual([
      expect.objectContaining({ label: 'Sabrina Drumond', minutes: 720, projectMinutes: 720, pendingMinutes: 240, projects: [{ label: '25A163E', minutes: 720 }] }),
      expect.objectContaining({ label: 'Alan Franklin', minutes: 180, projectMinutes: 120, projects: [{ label: '25A163E', minutes: 120 }, { label: 'EX-01', minutes: 60 }] }),
    ])
    expect(teamHours(rows)).toEqual([
      { label: 'Estudos', minutes: 900, projectMinutes: 840, people: 2, projects: 1, pendingMinutes: 240 },
      { label: 'Sem supervisão', minutes: 600, projectMinutes: 600, people: 1, projects: 1, pendingMinutes: 0 },
    ])
    expect(generalActivityHours(valid, names)).toEqual([{ label: 'Análise de documento', minutes: 840, people: 2 }, { label: 'outra', minutes: 60, people: 1 }])
    expect(hoursKpis(valid)).toEqual({ minutes: 900, projectShare: 840 / 900, registeredProjects: 1, people: 2, pendingMinutes: 240 })
  })

  it('formata horas e converte as linhas do banco', () => {
    expect([formatHours(480), formatHours(90), formatHours(5)]).toEqual(['8h', '1h30', '0h05'])
    expect(hoursRowFromDb({
      collaborator_id: 'x', collaborator_name: null, job_title: null, team_id: null, team_name: null, project_id: null, project_code: null, project_description: null, project_client: null,
      project_activity_id: null, project_activity_name: null, project_activity_complement: null, entry_project_code: null, entry_client: null, activity_id: null, status: 'XYZ', minutes: '90', entries: '2', days: '1',
    })).toMatchObject({ collaboratorName: 'Sem nome', status: 'PENDING', minutes: 90, entries: 2, entryProjectCode: '' })
  })
})
