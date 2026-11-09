import type { OneDriveConnection, ProjectSyncRun } from './types'

const dateTime = (value: string) => new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

export function syncText(run: ProjectSyncRun | null) {
  if (!run) return 'Ainda não sincronizado. Depois de conectado, roda sozinho 2 vezes por dia (7h e 13h).'
  const when = `${dateTime(run.startedAt)} (${run.trigger === 'agendado' ? 'automática' : 'manual'})`
  const file = run.fileModifiedAt ? ` · arquivo salvo em ${dateTime(run.fileModifiedAt)}` : ''
  if (run.status === 'erro') return `Última tentativa em ${when} falhou: ${run.error ?? 'erro desconhecido'}`
  if (run.status === 'sem_mudancas') return `Última verificação em ${when}: sem mudanças no arquivo${file}.`
  return `Última sincronização em ${when}${file}.`
}

export function connectionText(connection: OneDriveConnection | null) {
  if (!connection) return 'OneDrive não conectado. O dono do arquivo (Paulo) precisa clicar em “Conectar OneDrive” e entrar com a conta Microsoft dele.'
  const who = connection.accountName ? `${connection.accountName} (${connection.accountEmail})` : connection.accountEmail
  if (connection.status === 'expirada') return `A conexão com o OneDrive de ${who} expirou. Ele precisa clicar em “Conectar OneDrive” de novo.`
  return `Conectado ao OneDrive de ${who} desde ${dateTime(connection.connectedAt)}.`
}

const RETURN_MESSAGES: Record<string, string> = {
  admin: 'A Microsoft pediu aprovação de um administrador da SM&A para autorizar o app. Nesse caso, a conexão precisa ser feita pela TI.',
  cancelado: 'A conexão com o OneDrive foi cancelada.',
  state: 'O link de conexão expirou. Clique em “Conectar OneDrive” de novo.',
  config: 'A sincronização ainda não está configurada na Vercel.',
  login: 'Não foi possível concluir a conexão com a Microsoft. Tente de novo.',
  salvar: 'A Microsoft autorizou, mas não foi possível salvar a conexão. Tente de novo.',
}

/** Mensagem da volta do login da Microsoft (?onedrive=conectado|erro). */
export function oneDriveReturnMessage(params: URLSearchParams): { kind: 'ok' | 'erro' | 'aviso'; text: string } | null {
  const result = params.get('onedrive')
  if (result === 'conectado') {
    const account = params.get('conta') ?? 'a conta Microsoft'
    if (params.get('arquivo') === 'nao-encontrado') {
      return { kind: 'aviso', text: `OneDrive conectado com ${account}, mas não encontrei o ESTUDOS.sqlite no caminho configurado (PROJECTS_SYNC_FILE_PATH). Confira o caminho ou se entrou com a conta certa.` }
    }
    return { kind: 'ok', text: `OneDrive conectado com ${account}. Clique em “Sincronizar agora” para puxar os projetos.` }
  }
  if (result === 'erro') return { kind: 'erro', text: RETURN_MESSAGES[params.get('motivo') ?? ''] ?? RETURN_MESSAGES.login }
  return null
}
