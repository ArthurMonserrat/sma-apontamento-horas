import type { SupabaseClient } from '@supabase/supabase-js'
import { corporateDataError, getCorporateDataClient } from '../../corporate/corporateData'
import type { HoursReportRow } from './types'

type Row = {
  collaborator_id: string
  collaborator_name: string | null
  job_title: string | null
  team_id: string | null
  team_name: string | null
  project_id: string | null
  project_code: string | null
  project_description: string | null
  project_client: string | null
  project_activity_id: string | null
  project_activity_name: string | null
  project_activity_complement: string | null
  entry_project_code: string | null
  entry_client: string | null
  activity_id: string | null
  status: string
  minutes: number | string
  entries: number | string
  days: number | string
}

const STATUSES = new Set(['PENDING', 'APPROVED', 'REJECTED', 'ACTIVE'])

export function hoursRowFromDb(row: Row): HoursReportRow {
  return {
    collaboratorId: row.collaborator_id,
    collaboratorName: row.collaborator_name ?? 'Sem nome',
    jobTitle: row.job_title,
    teamId: row.team_id,
    teamName: row.team_name,
    projectId: row.project_id,
    projectCode: row.project_code,
    projectDescription: row.project_description,
    projectClient: row.project_client,
    projectActivityId: row.project_activity_id,
    projectActivityName: row.project_activity_name,
    projectActivityComplement: row.project_activity_complement,
    entryProjectCode: row.entry_project_code ?? '',
    entryClient: row.entry_client ?? '',
    activityId: row.activity_id ?? '',
    status: (STATUSES.has(row.status) ? row.status : 'PENDING') as HoursReportRow['status'],
    minutes: Number(row.minutes) || 0,
    entries: Number(row.entries) || 0,
    days: Number(row.days) || 0,
  }
}

/** Relatório de horas do Banco 1. O banco já limita: diretoria vê todos, supervisor só a equipe. */
export class HoursReportService {
  private readonly getClient: () => SupabaseClient | null

  constructor(getClient: () => SupabaseClient | null = getCorporateDataClient) {
    this.getClient = getClient
  }

  async load(startDate: string, endDate: string): Promise<HoursReportRow[]> {
    const client = this.getClient()
    if (!client) throw new Error('Sessão corporativa indisponível. Entre novamente.')
    const { data, error } = await client.rpc('banco1_hours_report', { start_date: startDate, end_date: endDate })
    if (error) throw corporateDataError(error, 'Não foi possível carregar o relatório de horas.')
    return ((data ?? []) as Row[]).map(hoursRowFromDb)
  }
}

export const hoursReportService = new HoursReportService()
