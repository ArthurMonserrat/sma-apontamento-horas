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
  members: CorporatePerson[]
}

export type SaveOnlineTeamInput = {
  id?: string
  name: string
  supervisorId: string
  memberIds: string[]
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
    const [{ data, error }, loadedPeople] = await Promise.all([
      this.client().from('teams').select('id,name,supervisor_id').eq('module', 'BANCO_1').eq('active', true).order('name', { ascending: true }),
      people ? Promise.resolve(people) : this.listPeopleForTeams(),
    ])
    if (error) throw corporateDataError(error, 'Não foi possível carregar as supervisões.')
    const byId = new Map(loadedPeople.map((person) => [person.id, person]))
    return ((data ?? []) as TeamRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      supervisorId: row.supervisor_id,
      supervisorName: (row.supervisor_id && byId.get(row.supervisor_id)?.name) || 'Sem supervisor',
      members: loadedPeople
        .filter((person) => person.teamId === row.id)
        .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR')),
    }))
  }

  async saveTeam(input: SaveOnlineTeamInput) {
    const name = input.name.trim()
    if (!name) throw new Error('Informe o nome da supervisão.')
    if (!input.supervisorId) throw new Error('Escolha o supervisor.')
    const memberIds = Array.from(new Set(input.memberIds.filter((id) => id && id !== input.supervisorId)))
    const { data, error } = await this.client().rpc('banco1_save_team', {
      team_id: input.id ?? null,
      team_name: name,
      supervisor: input.supervisorId,
      member_ids: memberIds,
    })
    if (error) throw corporateDataError(error, 'Não foi possível salvar a supervisão.')
    this.onChanged()
    return String(data)
  }

  async deactivateTeam(teamId: string) {
    const { error } = await this.client().rpc('banco1_deactivate_team', { team_id: teamId })
    if (error) throw corporateDataError(error, 'Não foi possível desativar a supervisão.')
    this.onChanged()
  }
}

export const onlineTeamService = new OnlineTeamService()
