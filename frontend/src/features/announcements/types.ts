export type ComunicadoTipo = 'info' | 'alerta' | 'urgente'
export type ComunicadoDestinatario = 'all' | 'team' | 'individual'

export interface Comunicado {
  id: string
  titulo: string
  mensagem: string
  dataPublicacao: string
  timestamp: string
  autor: string
  autorId?: string
  oculto_por: string[]
  tipo: ComunicadoTipo
  urgencia: ComunicadoTipo
  tipo_destinatario: ComunicadoDestinatario
  alvo_referencia: string | null
  /** O usuário logado já leu (contador e balão de notificação). */
  lido?: boolean
}
