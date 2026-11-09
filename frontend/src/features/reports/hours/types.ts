/** Linha do banco1_hours_report: horas somadas por pessoa/projeto/atividade/situação. */
export type HoursReportRow = {
  collaboratorId: string
  collaboratorName: string
  jobTitle: string | null
  teamId: string | null
  teamName: string | null
  projectId: string | null
  projectCode: string | null
  projectDescription: string | null
  projectClient: string | null
  projectActivityId: string | null
  projectActivityName: string | null
  projectActivityComplement: string | null
  entryProjectCode: string
  entryClient: string
  activityId: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ACTIVE'
  minutes: number
  entries: number
  days: number
}

/** validas = aprovadas + pendentes (sem rejeitadas). */
export type HoursStatusMode = 'validas' | 'aprovadas' | 'pendentes' | 'rejeitadas'
