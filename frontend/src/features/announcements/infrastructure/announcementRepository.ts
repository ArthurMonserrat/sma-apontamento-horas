import type { SupabaseClient } from '@supabase/supabase-js'
import { corporateDataError, getCorporateDataClient, getCorporateUserId, isCorporateDataActive } from '../../corporate/corporateData'
import { demoAnnouncements } from '../demoAnnouncements'
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
  /** Marca como lidos (contador e balão de notificação). */
  markRead(ids: string[], userId: string): Promise<void>
}

export const BANCO1_ANNOUNCEMENTS_TABLE = 'banco1_announcements'
export const BANCO1_ANNOUNCEMENT_HIDDEN_TABLE = 'banco1_announcement_hidden'
export const BANCO1_ANNOUNCEMENT_READS_TABLE = 'banco1_announcement_reads'
export const ANNOUNCEMENT_READS_STORAGE_KEY = 'sma:announcements-read:v1'

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

export function announcementFromRow(row: AnnouncementRow, hiddenIds: Set<string>, userId: string | null, readIds: Set<string> = new Set()): Comunicado {
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
    lido: readIds.has(row.id) || (userId !== null && row.author_id === userId),
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
    const [announcements, hidden, reads] = await Promise.all([
      client.from(BANCO1_ANNOUNCEMENTS_TABLE).select('*').order('created_at', { ascending: false }),
      client.from(BANCO1_ANNOUNCEMENT_HIDDEN_TABLE).select('announcement_id'),
      client.from(BANCO1_ANNOUNCEMENT_READS_TABLE).select('announcement_id'),
    ])
    if (announcements.error) throw corporateDataError(announcements.error, 'Não foi possível carregar os avisos.')
    if (hidden.error) throw corporateDataError(hidden.error, 'Não foi possível carregar os avisos.')
    const hiddenIds = new Set(((hidden.data ?? []) as Array<{ announcement_id: string }>).map((row) => row.announcement_id))
    // Sem a tabela de lidos (migration ainda não aplicada) os avisos continuam aparecendo, só sem o contador.
    const rows = (announcements.data ?? []) as AnnouncementRow[]
    const readIds = new Set(reads.error
      ? rows.map((row) => row.id)
      : ((reads.data ?? []) as Array<{ announcement_id: string }>).map((row) => row.announcement_id))
    const userId = this.getUserId()
    return rows.map((row) => announcementFromRow(row, hiddenIds, userId, readIds))
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

  async markRead(ids: string[], userId: string) {
    const unique = Array.from(new Set(ids.filter(Boolean)))
    if (unique.length === 0) return
    const { error } = await this.client()
      .from(BANCO1_ANNOUNCEMENT_READS_TABLE)
      .upsert(unique.map((id) => ({ announcement_id: id, profile_id: userId })), { onConflict: 'announcement_id,profile_id', ignoreDuplicates: true })
    if (error) throw corporateDataError(error, 'Não foi possível marcar os avisos como lidos.')
  }
}

function readLocalReads(): Record<string, string[]> {
  if (typeof window === 'undefined') return {}
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ANNOUNCEMENT_READS_STORAGE_KEY) || '{}') as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, string[]> : {}
  } catch {
    return {}
  }
}

/** Modo demonstração: avisos no navegador, com os exemplos iniciais. */
export class LocalAnnouncementRepository implements AnnouncementRepository {
  private readonly seed: Comunicado[]

  constructor(seed: Comunicado[] = [], getUserId: () => string | null = () => null) {
    this.seed = seed
    this.getUserId = getUserId
  }

  private readonly getUserId: () => string | null

  async list() {
    const userId = this.getUserId()
    const read = new Set(userId ? readLocalReads()[userId] ?? [] : [])
    return readAnnouncements(this.seed).map((item) => ({ ...item, lido: read.has(item.id) || (Boolean(userId) && item.autorId === userId) }))
  }

  async markRead(ids: string[], userId: string) {
    if (typeof window === 'undefined' || ids.length === 0) return
    const all = readLocalReads()
    all[userId] = Array.from(new Set([...(all[userId] ?? []), ...ids]))
    try {
      window.localStorage.setItem(ANNOUNCEMENT_READS_STORAGE_KEY, JSON.stringify(all))
    } catch {
      // Sem armazenamento local o contador só zera ao recarregar.
    }
  }

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

let corporateRepository: SupabaseAnnouncementRepository | null = null
let demoRepository: LocalAnnouncementRepository | null = null
let demoUserId: string | null = null

/** Modo demonstração: informa o usuário para controlar os avisos lidos. */
export function setDemoAnnouncementUser(userId: string | null) {
  demoUserId = userId
}

/** Login Microsoft: banco de dados. Demonstração: navegador, com avisos de exemplo. */
export function getAnnouncementRepository(corporate: boolean = isCorporateDataActive()): AnnouncementRepository {
  if (corporate) {
    corporateRepository ??= new SupabaseAnnouncementRepository()
    return corporateRepository
  }
  demoRepository ??= new LocalAnnouncementRepository(demoAnnouncements, () => demoUserId)
  return demoRepository
}
