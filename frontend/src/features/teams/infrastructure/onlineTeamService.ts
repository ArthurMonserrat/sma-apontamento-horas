import type { SupabaseClient } from '@supabase/supabase-js'
import {
  clearCorporatePeopleCache,
  corporateDataError,
  getCorporateDataClient,
  listCorporatePeople,
  type CorporatePerson,
} from '../../corporate/corporateData'

/** Supervisão (equipe) do Banco 1 gravada no banco de dados. */
export type OnlineTeam = {
  id: string
  name: string
  supervisorId: string | null
  supervisorName: string
  /** Supervisores adicionais (também veem e aprovam a equipe). */
  coSupervisorIds: string[]
  coSupervisorNames: string[]
  members: CorporatePerson[]
}

export type SaveOnlineTeamInput = {
  id?: string
  name: string
  supervisorId: string
  memberIds: string[]
  coSupervisorIds?: string[]
}

type TeamRow = { id: string; name: string; supervisor_id: string | null }

type Dependencies = {
  getClient?: () => SupabaseClient | null
  listPeople?: () => Promise<CorporatePerson[]>
  onChanged?: () => void
}

export class OnlineTeamService {
  private readonly getClient: () => SupabaseClient | null
  private readonly listPeople: () => Promise<CorporatePerson[]>
  private readonly onChanged: () => void

  constructor({ getClient, listPeople, onChanged }: Dependencies = {}) {
    this.getClient = getClient ?? getCorporateDataClient
    this.listPeople = listPeople ?? listCorporatePeople
    this.onChanged = onChanged ?? clearCorporatePeopleCache
  }

  private client() {
    const client = this.getClient()
    if (!client) throw new Error('Sessão corporativa indisponível. Entre novamente.')
    return client
  }

  /** Pessoas com acesso ao Banco 1 (a diretoria vê todas). */
  async listPeopleForTeams() {
    this.onChanged()
    return this.listPeople()
  }

  async listTeams(people?: CorporatePerson[]): Promise<OnlineTeam[]> {
    const [{ data, error }, coSupervisors, loadedPeople] = await Promise.all([
      this.client().from('teams').select('id,name,supervisor_id').eq('module', 'BANCO_1').eq('active', true).order('name', { ascending: true }),
      this.client().from('team_supervisors').select('team_id,profile_id').eq('module', 'BANCO_1'),
      people ? Promise.resolve(people) : this.listPeopleForTeams(),
    ])
    if (error) throw corporateDataError(error, 'Não foi possível carregar as supervisões.')
    const byId = new Map(loadedPeople.map((person) => [person.id, person]))
    // Sem a tabela de supervisores adicionais (migration ainda não aplicada), cada equipe fica só com o principal.
    const coRows = coSupervisors.error ? [] : (coSupervisors.data ?? []) as Array<{ team_id: string; profile_id: string }>
    return ((data ?? []) as TeamRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      supervisorId: row.supervisor_id,
      supervisorName: (row.supervisor_id && byId.get(row.supervisor_id)?.name) || 'Sem supervisor',
      coSupervisorIds: coRows.filter((item) => item.team_id === row.id).map((item) => item.profile_id),
      coSupervisorNames: coRows.filter((item) => item.team_id === row.id).map((item) => byId.get(item.profile_id)?.name ?? 'Supervisor')
        .sort((left, right) => left.localeCompare(right, 'pt-BR')),
      members: loadedPeople
        .filter((person) => person.teamId === row.id)
        .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR')),
    }))
  }

  async saveTeam(input: SaveOnlineTeamInput) {
    const name = input.name.trim()
    if (!name) throw new Error('Informe o nome da supervisão.')
    if (!input.supervisorId) throw new Error('Escolha o supervisor.')
    const coSupervisorIds = Array.from(new Set((input.coSupervisorIds ?? []).filter((id) => id && id !== input.supervisorId)))
    const memberIds = Array.from(new Set(input.memberIds.filter((id) => id && id !== input.supervisorId && !coSupervisorIds.includes(id))))
    const { data, error } = await this.client().rpc('banco1_save_team', {
      team_id: input.id ?? null,
      team_name: name,
      supervisor: input.supervisorId,
      member_ids: memberIds,
      co_supervisor_ids: coSupervisorIds,
    })
    if (error) throw corporateDataError(error, 'Não foi possível salvar a supervisão.')
    this.onChanged()
    return String(data)
  }

  /** Diretoria: define o cargo da pessoa (vazio apaga). */
  async setJobTitle(personId: string, jobTitle: string) {
    const { error } = await this.client().rpc('banco1_set_job_title', { target: personId, job_title: jobTitle.trim() || null })
    if (error) throw corporateDataError(error, 'Não foi possível salvar o cargo.')
    this.onChanged()
  }

  async deactivateTeam(teamId: string) {
    const { error } = await this.client().rpc('banco1_deactivate_team', { team_id: teamId })
    if (error) throw corporateDataError(error, 'Não foi possível desativar a supervisão.')
    this.onChanged()
  }
}

export const onlineTeamService = new OnlineTeamService()
