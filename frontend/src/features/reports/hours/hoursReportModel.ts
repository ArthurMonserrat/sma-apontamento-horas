import type { HoursReportRow, HoursStatusMode } from './types'

/**
 * Agregações do relatório de horas (tudo calculado a partir das linhas do banco1_hours_report).
 * Projeto cadastrado = apontamento com projeto escolhido; os demais aparecem pelo
 * "número da contratada" digitado, marcados como "não cadastrado".
 */

export const NO_TEAM = 'Sem supervisão'
const NO_ACTIVITY = 'Sem atividade do projeto'

export function filterRows(rows: HoursReportRow[], filters: { status: HoursStatusMode; teamName?: string }) {
  return rows.filter((row) => {
    const statusOk = filters.status === 'validas' ? row.status !== 'REJECTED'
      : filters.status === 'aprovadas' ? row.status === 'APPROVED'
        : filters.status === 'pendentes' ? row.status === 'PENDING' || row.status === 'ACTIVE'
          : row.status === 'REJECTED'
    return statusOk && (!filters.teamName || (row.teamName ?? NO_TEAM) === filters.teamName)
  })
}

const sum = (rows: HoursReportRow[]) => rows.reduce((total, row) => total + row.minutes, 0)
const byLabel = (left: { label: string }, right: { label: string }) => left.label.localeCompare(right.label, 'pt-BR')
const byMinutes = <T extends { minutes: number; label: string }>(left: T, right: T) => right.minutes - left.minutes || byLabel(left, right)

function groupBy<K>(rows: HoursReportRow[], key: (row: HoursReportRow) => K) {
  const groups = new Map<K, HoursReportRow[]>()
  for (const row of rows) groups.set(key(row), [...(groups.get(key(row)) ?? []), row])
  return groups
}

export type PersonMinutes = { id: string; label: string; minutes: number }
export type ActivityHours = { key: string; label: string; minutes: number; approvedMinutes: number; people: PersonMinutes[] }
export type ProjectHours = {
  key: string
  label: string
  code: string
  description: string
  client: string
  registered: boolean
  minutes: number
  approvedMinutes: number
  pendingMinutes: number
  entries: number
  people: PersonMinutes[]
  activities: ActivityHours[]
}

function people(rows: HoursReportRow[]): PersonMinutes[] {
  return Array.from(groupBy(rows, (row) => row.collaboratorId), ([id, items]) => ({ id, label: items[0].collaboratorName, minutes: sum(items) })).sort(byMinutes)
}

const approved = (rows: HoursReportRow[]) => sum(rows.filter((row) => row.status === 'APPROVED'))
const pending = (rows: HoursReportRow[]) => sum(rows.filter((row) => row.status === 'PENDING' || row.status === 'ACTIVE'))

/** Horas por projeto, com as atividades e quem trabalhou em cada uma. */
export function projectHours(rows: HoursReportRow[], activityName: (id: string) => string): ProjectHours[] {
  const groups = groupBy(rows, (row) => row.projectId ?? `codigo:${row.entryProjectCode.trim().toUpperCase() || '—'}`)
  return Array.from(groups, ([key, items]): ProjectHours => {
    const first = items[0]
    const registered = Boolean(first.projectId)
    const code = registered ? first.projectCode ?? '' : first.entryProjectCode.trim().toUpperCase() || '—'
    const activities = Array.from(groupBy(items, (row) => registered ? row.projectActivityId ?? '' : `geral:${row.activityId}`), ([activityKey, activityRows]): ActivityHours => {
      const sample = activityRows[0]
      const label = registered
        ? sample.projectActivityName ? (sample.projectActivityComplement ? `${sample.projectActivityName} — ${sample.projectActivityComplement}` : sample.projectActivityName) : NO_ACTIVITY
        : activityName(sample.activityId)
      return { key: activityKey || 'sem', label, minutes: sum(activityRows), approvedMinutes: approved(activityRows), people: people(activityRows) }
    }).sort(byMinutes)
    return {
      key,
      label: registered && first.projectDescription ? `${code} — ${first.projectDescription}` : code,
      code,
      description: registered ? first.projectDescription ?? '' : '',
      client: registered ? first.projectClient ?? '' : first.entryClient,
      registered,
      minutes: sum(items),
      approvedMinutes: approved(items),
      pendingMinutes: pending(items),
      entries: items.reduce((total, row) => total + row.entries, 0),
      people: people(items),
      activities,
    }
  }).sort((left, right) => Number(right.registered) - Number(left.registered) || right.minutes - left.minutes || left.code.localeCompare(right.code))
}

export type CollaboratorHours = {
  id: string
  label: string
  jobTitle: string | null
  team: string
  minutes: number
  projectMinutes: number
  approvedMinutes: number
  pendingMinutes: number
  projects: Array<{ label: string; minutes: number }>
}

/** Horas por pessoa: total, quanto foi em projetos cadastrados e em quais projetos. */
export function collaboratorHours(rows: HoursReportRow[]): CollaboratorHours[] {
  return Array.from(groupBy(rows, (row) => row.collaboratorId), ([id, items]): CollaboratorHours => ({
    id,
    label: items[0].collaboratorName,
    jobTitle: items[0].jobTitle,
    team: items[0].teamName ?? NO_TEAM,
    minutes: sum(items),
    projectMinutes: sum(items.filter((row) => row.projectId)),
    approvedMinutes: approved(items),
    pendingMinutes: pending(items),
    projects: Array.from(groupBy(items, (row) => row.projectCode ?? (row.entryProjectCode.trim().toUpperCase() || '—')), ([label, projectRows]) => ({ label, minutes: sum(projectRows) })).sort(byMinutes),
  })).sort(byMinutes)
}

export type TeamHours = { label: string; minutes: number; projectMinutes: number; people: number; projects: number; pendingMinutes: number }

/** Horas por supervisão (equipe atual de cada pessoa). */
export function teamHours(rows: HoursReportRow[]): TeamHours[] {
  return Array.from(groupBy(rows, (row) => row.teamName ?? NO_TEAM), ([label, items]) => ({
    label,
    minutes: sum(items),
    projectMinutes: sum(items.filter((row) => row.projectId)),
    people: new Set(items.map((row) => row.collaboratorId)).size,
    projects: new Set(items.filter((row) => row.projectId).map((row) => row.projectId)).size,
    pendingMinutes: pending(items),
  })).sort(byMinutes)
}

export type GeneralActivityHours = { label: string; minutes: number; people: number }

/** Horas por "Atividade realizada" (lista geral do formulário). */
export function generalActivityHours(rows: HoursReportRow[], activityName: (id: string) => string): GeneralActivityHours[] {
  return Array.from(groupBy(rows, (row) => row.activityId), ([id, items]) => ({
    label: activityName(id),
    minutes: sum(items),
    people: new Set(items.map((row) => row.collaboratorId)).size,
  })).sort(byMinutes)
}

export type HoursKpis = { minutes: number; projectShare: number; registeredProjects: number; people: number; pendingMinutes: number }

export function hoursKpis(rows: HoursReportRow[]): HoursKpis {
  const minutes = sum(rows)
  return {
    minutes,
    projectShare: minutes > 0 ? sum(rows.filter((row) => row.projectId)) / minutes : 0,
    registeredProjects: new Set(rows.filter((row) => row.projectId).map((row) => row.projectId)).size,
    people: new Set(rows.map((row) => row.collaboratorId)).size,
    pendingMinutes: pending(rows),
  }
}

/** 90 → "1h30"; 480 → "8h". */
export function formatHours(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  return rest === 0 ? `${hours}h` : `${hours}h${String(rest).padStart(2, '0')}`
}

/** Horas decimais para o Excel (480 → 8). */
export const decimalHours = (minutes: number) => Math.round((minutes / 60) * 100) / 100
