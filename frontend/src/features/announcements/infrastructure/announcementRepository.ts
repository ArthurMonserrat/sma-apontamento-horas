import type { SupabaseClient } from '@supabase/supabase-js'
import { corporateDataError, getCorporateDataClient, getCorporateUserId } from '../../corporate/corporateData'
import type { Comunicado, ComunicadoDestinatario, ComunicadoTipo } from '../types'
import {
  ANNOUNCEMENTS_UPDATED_EVENT,
  deleteAnnouncement,
  hideAnnouncementForUser,
  readAnnouncements,
  saveAnnouncement,
} from './announcementService'

export type NewAnnouncementInput = {
  titulo: string
  mensagem: string
  urgencia: ComunicadoTipo
  tipoDestinatario: ComunicadoDestinatario
  /** Equipe (team) ou pessoa (individual). */
  alvoReferencia: string | null
  /** Só no modo demonstração: o banco define o autor com o perfil de quem publica. */
  autor: string
  autorId?: string
}

export interface AnnouncementRepository {
  list(): Promise<Comunicado[]>
  create(input: NewAnnouncementInput): Promise<void>
  remove(id: string): Promise<boolean>
  hide(id: string, userId: string): Promise<boolean>
}

export const BANCO1_ANNOUNCEMENTS_TABLE = 'banco1_announcements'
export const BANCO1_ANNOUNCEMENT_HIDDEN_TABLE = 'banco1_announcement_hidden'

type AnnouncementRow = {
  id: string
  title: string
  message: string
  urgency: string
  recipient_type: string
  team_id: string | null
  recipient_id: string | null
  author_id: string
  author_name: string
  created_at: string
}

const URGENCIES = new Set<ComunicadoTipo>(['info', 'alerta', 'urgente'])
const RECIPIENTS = new Set<ComunicadoDestinatario>(['all', 'team', 'individual'])

function notifyChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(ANNOUNCEMENTS_UPDATED_EVENT))
}

export function announcementFromRow(row: AnnouncementRow, hiddenIds: Set<string>, userId: string | null): Comunicado {
  const urgencia = URGENCIES.has(row.urgency as ComunicadoTipo) ? row.urgency as ComunicadoTipo : 'info'
  const tipoDestinatario = RECIPIENTS.has(row.recipient_type as ComunicadoDestinatario) ? row.recipient_type as ComunicadoDestinatario : 'all'
  return {
    id: row.id,
    titulo: row.title,
    mensagem: row.message,
    dataPublicacao: row.created_at,
    timestamp: row.created_at,
    autor: row.author_name || 'Gestão',
    autorId: row.author_id,
    oculto_por: hiddenIds.has(row.id) && userId ? [userId] : [],
    tipo: urgencia,
    urgencia,
    tipo_destinatario: tipoDestinatario,
    alvo_referencia: tipoDestinatario === 'team' ? row.team_id : tipoDestinatario === 'individual' ? row.recipient_id : null,
  }
}

/** Avisos no banco de dados: a RLS só entrega os avisos destinados ao usuário logado. */
export class SupabaseAnnouncementRepository implements AnnouncementRepository {
  private readonly getClient: () => SupabaseClient | null
  private readonly getUserId: () => string | null

  constructor(getClient: () => SupabaseClient | null = getCorporateDataClient, getUserId: () => string | null = getCorporateUserId) {
    this.getClient = getClient
    this.getUserId = getUserId
  }

  private client() {
    const client = this.getClient()
    if (!client) throw new Error('Sessão corporativa indisponível. Entre novamente.')
    return client
  }

  async list() {
    const client = this.client()
    const [announcements, hidden] = await Promise.all([
      client.from(BANCO1_ANNOUNCEMENTS_TABLE).select('*').order('created_at', { ascending: false }),
      client.from(BANCO1_ANNOUNCEMENT_HIDDEN_TABLE).select('announcement_id'),
    ])
    if (announcements.error) throw corporateDataError(announcements.error, 'Não foi possível carregar os avisos.')
    if (hidden.error) throw corporateDataError(hidden.error, 'Não foi possível carregar os avisos.')
    const hiddenIds = new Set(((hidden.data ?? []) as Array<{ announcement_id: string }>).map((row) => row.announcement_id))
    const userId = this.getUserId()
    return ((announcements.data ?? []) as AnnouncementRow[]).map((row) => announcementFromRow(row, hiddenIds, userId))
  }

  async create(input: NewAnnouncementInput) {
    const title = input.titulo.trim()
    const message = input.mensagem.trim()
    if (!title || !message) throw new Error('Preencha o título e a mensagem para enviar o aviso.')
    if (input.tipoDestinatario !== 'all' && !input.alvoReferencia) throw new Error('Escolha o destinatário do aviso.')
    const { error } = await this.client().from(BANCO1_ANNOUNCEMENTS_TABLE).insert({
      title,
      message,
      urgency: input.urgencia,
      recipient_type: input.tipoDestinatario,
      team_id: input.tipoDestinatario === 'team' ? input.alvoReferencia : null,
      recipient_id: input.tipoDestinatario === 'individual' ? input.alvoReferencia : null,
    })
    if (error) throw corporateDataError(error, 'Não foi possível enviar o aviso para esse destinatário.')
    notifyChanged()
  }

  async remove(id: string) {
    const { data, error } = await this.client().from(BANCO1_ANNOUNCEMENTS_TABLE).delete().eq('id', id).select('id')
    if (error) throw corporateDataError(error, 'Não foi possível excluir o aviso.')
    const removed = (data ?? []).length > 0
    if (!removed) throw new Error('Você não pode excluir este aviso.')
    notifyChanged()
    return true
  }

  async hide(id: string, userId: string) {
    const { error } = await this.client().from(BANCO1_ANNOUNCEMENT_HIDDEN_TABLE).insert({ announcement_id: id, profile_id: userId })
    if (error && error.code !== '23505') throw corporateDataError(error, 'Não foi possível ocultar o aviso.')
    notifyChanged()
    return true
  }
}

/** Modo demonstração: avisos no navegador, com os exemplos iniciais. */
export class LocalAnnouncementRepository implements AnnouncementRepository {
  private readonly seed: Comunicado[]

  constructor(seed: Comunicado[] = []) {
    this.seed = seed
  }

  async list() { return readAnnouncements(this.seed) }

  async create(input: NewAnnouncementInput) {
    const titulo = input.titulo.trim()
    const mensagem = input.mensagem.trim()
    if (!titulo || !mensagem) throw new Error('Preencha o título e a mensagem para enviar o aviso.')
    const timestamp = new Date().toISOString()
    saveAnnouncement({
      id: crypto.randomUUID(),
      titulo,
      mensagem,
      dataPublicacao: timestamp,
      timestamp,
      autor: input.autor,
      autorId: input.autorId,
      oculto_por: [],
      tipo: input.urgencia,
      urgencia: input.urgencia,
      tipo_destinatario: input.tipoDestinatario,
      alvo_referencia: input.tipoDestinatario === 'all' ? 'geral' : input.alvoReferencia,
    })
  }

  async remove(id: string) { return deleteAnnouncement(id) }

  async hide(id: string, userId: string) { return hideAnnouncementForUser(id, userId) }
}
