import type { SupabaseClient } from '@supabase/supabase-js'
import { corporateDataError, getCorporateDataClient } from '../../corporate/corporateData'
import type { OneDriveConnection, Project, ProjectInput, ProjectSyncRun, SaveProjectsResult } from '../types'

type ActivityRow = {
  id: string
  name: string
  complement: string | null
  executor_id: string | null
  executor_name: string | null
  active: boolean
}

type ProjectRow = {
  id: string
  code: string
  supervision_code: string | null
  client: string
  final_client: string | null
  location: string | null
  market_segment: string | null
  description: string | null
  active: boolean
  activities?: ActivityRow[] | null
}

export function projectFromRow(row: ProjectRow): Project {
  return {
    id: row.id,
    code: row.code,
    supervisionCode: row.supervision_code,
    client: row.client,
    finalClient: row.final_client,
    location: row.location,
    marketSegment: row.market_segment,
    description: row.description ?? '',
    active: row.active,
    activities: (row.activities ?? [])
      .map((activity) => ({
        id: activity.id,
        name: activity.name,
        complement: activity.complement,
        executorId: activity.executor_id,
        executorName: activity.executor_name,
        active: activity.active,
      }))
      .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR') || (left.complement ?? '').localeCompare(right.complement ?? '', 'pt-BR')),
  }
}

function toPayload(input: ProjectInput) {
  const payload: Record<string, unknown> = {
    code: input.code.trim().toUpperCase(),
    client: input.client.trim(),
    activities: input.activities
      .filter((activity) => activity.name.trim())
      .map((activity) => ({
        name: activity.name.trim(),
        complement: activity.complement?.trim() || null,
        executor_id: activity.executorId || null,
        executor_name: activity.executorId ? null : activity.executorName?.trim() || null,
      })),
  }
  // Só envia o que foi informado: campo ausente mantém o valor atual no banco.
  if (input.supervisionCode !== undefined) payload.supervision_code = input.supervisionCode?.trim() || null
  if (input.finalClient !== undefined) payload.final_client = input.finalClient?.trim() || null
  if (input.location !== undefined) payload.location = input.location?.trim() || null
  if (input.marketSegment !== undefined) payload.market_segment = input.marketSegment?.trim() || null
  if (input.description !== undefined) payload.description = input.description.trim()
  if (input.active !== undefined) payload.active = input.active
  return payload
}

/** Projetos do Banco 1 no Supabase. Só a diretoria grava (o banco recusa os demais). */
export class ProjectService {
  private readonly getClient: () => SupabaseClient | null

  constructor(getClient: () => SupabaseClient | null = getCorporateDataClient) {
    this.getClient = getClient
  }

  private client() {
    const client = this.getClient()
    if (!client) throw new Error('Sessão corporativa indisponível. Entre novamente.')
    return client
  }

  async list(options: { includeInactive?: boolean } = {}): Promise<Project[]> {
    let request = this.client()
      .from('banco1_projects')
      .select('id,code,supervision_code,client,final_client,location,market_segment,description,active,activities:banco1_project_activities(id,name,complement,executor_id,executor_name,active)')
      .order('code', { ascending: true })
    if (!options.includeInactive) request = request.eq('active', true)
    const { data, error } = await request
    if (error) throw corporateDataError(error, 'Não foi possível carregar os projetos.')
    return ((data ?? []) as ProjectRow[]).map(projectFromRow)
  }

  /** replaceActivities: true na tela (a lista enviada vira a lista do projeto); false na importação (só acrescenta). */
  async save(projects: ProjectInput[], options: { replaceActivities: boolean }): Promise<SaveProjectsResult> {
    if (projects.length === 0) throw new Error('Nenhum projeto para salvar.')
    for (const project of projects) {
      if (!project.code.trim()) throw new Error('Informe o código do projeto.')
      if (!project.client.trim()) throw new Error(`Informe o cliente do projeto ${project.code.trim()}.`)
    }
    const { data, error } = await this.client().rpc('banco1_save_projects', {
      projects: projects.map(toPayload),
      replace_activities: options.replaceActivities,
    })
    if (error) throw corporateDataError(error, 'Não foi possível salvar os projetos.')
    const result = (data ?? {}) as Record<string, unknown>
    return {
      projectIds: Array.isArray(result.project_ids) ? result.project_ids as string[] : [],
      projectsCreated: Number(result.projects_created ?? 0),
      projectsUpdated: Number(result.projects_updated ?? 0),
      activitiesSaved: Number(result.activities_saved ?? 0),
      activitiesRemoved: Number(result.activities_removed ?? 0),
      unmatchedExecutors: Array.isArray(result.unmatched_executors) ? result.unmatched_executors as string[] : [],
    }
  }

  /** Última sincronização com o OneDrive (null se ainda não houve ou a tabela não existe). */
  async lastSync(): Promise<ProjectSyncRun | null> {
    const { data, error } = await this.client()
      .from('banco1_project_sync_runs')
      .select('started_at,trigger,status,file_modified_at,error,summary')
      .order('started_at', { ascending: false })
      .range(0, 0)
    if (error) return null
    const row = (data ?? [])[0] as { started_at: string; trigger: ProjectSyncRun['trigger']; status: ProjectSyncRun['status']; file_modified_at: string | null; error: string | null; summary: Record<string, unknown> | null } | undefined
    if (!row) return null
    return { startedAt: row.started_at, trigger: row.trigger, status: row.status, fileModifiedAt: row.file_modified_at, error: row.error, summary: row.summary }
  }

  private async callSyncApi(path: string, doFetch: typeof fetch) {
    const { data } = await this.client().auth.getSession()
    const token = data.session?.access_token
    if (!token) throw new Error('Sessão expirada. Entre novamente.')
    let response: Response
    try {
      response = await doFetch(path, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    } catch {
      throw new Error('Sem conexão com o servidor. Tente de novo.')
    }
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null
    if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : `A operação falhou (erro ${response.status}).`)
    return payload ?? {}
  }

  /** "Sincronizar agora": o servidor baixa o ESTUDOS.sqlite do OneDrive e atualiza os projetos. */
  async syncNow(doFetch: typeof fetch = fetch): Promise<{ status: string; summary?: Record<string, unknown> }> {
    const payload = await this.callSyncApi('/api/projects-sync', doFetch)
    return { status: typeof payload.status === 'string' ? payload.status : 'ok', summary: payload.summary as Record<string, unknown> | undefined }
  }

  /** "Conectar OneDrive": devolve o link de login da Microsoft (quem entra deve ser o dono do arquivo). */
  async oneDriveConnectUrl(doFetch: typeof fetch = fetch): Promise<string> {
    const payload = await this.callSyncApi('/api/projects-sync?action=connect', doFetch)
    if (typeof payload.url !== 'string') throw new Error('O servidor não devolveu o link de login da Microsoft.')
    return payload.url
  }

  /** Com qual conta o OneDrive está conectado (só diretoria). */
  async oneDriveStatus(): Promise<OneDriveConnection | null> {
    const { data, error } = await this.client().rpc('banco1_onedrive_status')
    if (error) return null
    const row = (Array.isArray(data) ? data[0] : data) as { account_email: string; account_name: string | null; connected_at: string; status: OneDriveConnection['status']; last_error: string | null } | undefined
    if (!row) return null
    return { accountEmail: row.account_email, accountName: row.account_name, connectedAt: row.connected_at, status: row.status, lastError: row.last_error }
  }

  async setActive(projectId: string, active: boolean) {
    const { error } = await this.client().rpc('banco1_set_project_active', { project_id: projectId, active })
    if (error) throw corporateDataError(error, 'Não foi possível alterar o projeto.')
  }
}

export const projectService = new ProjectService()
