import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import initSqlJs from 'sql.js'
import { projectsFromDatabase, type EstudosProject } from '../frontend/src/features/projects/estudosSqlite.js'

/**
 * Sincronização dos projetos do Banco 1 com o ESTUDOS.sqlite do OneDrive do Paulo.
 * Sem a TI: o próprio Paulo conecta o OneDrive dele uma vez (botão "Conectar OneDrive"),
 * autorizando o app de login da SM&A a ler os arquivos dele (Files.Read, delegado).
 * O servidor guarda o refresh token CRIPTOGRAFADO no Supabase e, a cada sincronização,
 * troca por um token de acesso, baixa o arquivo e manda tudo para banco1_sync_projects.
 */

export type SyncTrigger = 'agendado' | 'manual'

export type ProjectSyncConfig = {
  tenantId: string
  clientId: string
  clientSecret: string
  /** Caminho do arquivo dentro de "Meus arquivos" do OneDrive de quem conectou (ex.: Controle/ESTUDOS.sqlite). */
  filePath: string
  /** Segredo do servidor: autentica o agendamento, assina o "state" do login e criptografa o refresh token. */
  serverSecret: string
}

export type SyncRpc = (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>

export type ProjectSyncDeps = {
  fetch: typeof fetch
  rpc: SyncRpc
  lastSuccessfulRun: () => Promise<{ fileEtag: string | null } | null>
  loadWasm?: () => Promise<ArrayBuffer>
}

export type ProjectSyncResult =
  | { status: 'ok'; summary: Record<string, unknown>; fileModifiedAt: string | null }
  | { status: 'sem_mudancas'; fileModifiedAt: string | null }

export const ONEDRIVE_SCOPES = 'offline_access User.Read Files.Read'
const GRAPH = 'https://graph.microsoft.com/v1.0'
const MAX_FILE_BYTES = 100 * 1024 * 1024
const SQLITE_HEADER = 'SQLite format 3\u0000'
const STATE_TTL_MS = 15 * 60 * 1000

/** Erro com mensagem que pode ir para a tela (sem segredos). */
export class ProjectSyncError extends Error {
  constructor(message: string, readonly httpStatus = 502) {
    super(message)
    this.name = 'ProjectSyncError'
  }
}

/** Usa as variáveis PROJECTS_SYNC_*; client/tenant podem vir das do app de login (CLIENT_ID, CLIENT_SECRET, TENANT_ID). */
export function readProjectSyncConfig(env: Record<string, string | undefined> = process.env): { config: ProjectSyncConfig | null; missing: string[] } {
  const pick = (name: string, fallback?: string) => env[name]?.trim() || (fallback ? env[fallback]?.trim() : '') || ''
  const values = {
    PROJECTS_SYNC_TENANT_ID: pick('PROJECTS_SYNC_TENANT_ID', 'TENANT_ID'),
    PROJECTS_SYNC_CLIENT_ID: pick('PROJECTS_SYNC_CLIENT_ID', 'CLIENT_ID'),
    PROJECTS_SYNC_CLIENT_SECRET: pick('PROJECTS_SYNC_CLIENT_SECRET', 'CLIENT_SECRET'),
    PROJECTS_SYNC_FILE_PATH: pick('PROJECTS_SYNC_FILE_PATH'),
    PROJECTS_SYNC_TOKEN: pick('PROJECTS_SYNC_TOKEN'),
  }
  const missing = Object.entries(values).filter(([name, value]) => !value || (name === 'PROJECTS_SYNC_TOKEN' && value.length < 32)).map(([name]) => name)
  if (missing.length > 0) return { config: null, missing }
  return {
    missing: [],
    config: {
      tenantId: values.PROJECTS_SYNC_TENANT_ID,
      clientId: values.PROJECTS_SYNC_CLIENT_ID,
      clientSecret: values.PROJECTS_SYNC_CLIENT_SECRET,
      filePath: values.PROJECTS_SYNC_FILE_PATH.replace(/^\/+|\/+$/g, ''),
      serverSecret: values.PROJECTS_SYNC_TOKEN,
    },
  }
}

// ---------- criptografia do refresh token e assinatura do state ----------

const keyFor = (secret: string, purpose: string) => createHash('sha256').update(`banco1-onedrive:${purpose}:${secret}`).digest()

export function encryptSecret(plain: string, secret: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyFor(secret, 'token'), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.')
}

export function decryptSecret(sealed: string, secret: string) {
  const [version, iv, tag, data] = sealed.split('.')
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('formato')
  const decipher = createDecipheriv('aes-256-gcm', keyFor(secret, 'token'), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
}

export function signState(userId: string, secret: string, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ u: userId, e: now + STATE_TTL_MS, n: randomBytes(8).toString('hex') })).toString('base64url')
  const mac = createHmac('sha256', keyFor(secret, 'state')).update(body).digest('base64url')
  return `${body}.${mac}`
}

export function verifyState(state: string, secret: string, now = Date.now()): { userId: string } | null {
  const [body, mac] = state.split('.')
  if (!body || !mac) return null
  const expected = createHmac('sha256', keyFor(secret, 'state')).update(body).digest()
  const received = Buffer.from(mac, 'base64url')
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { u?: unknown; e?: unknown }
    if (typeof payload.u !== 'string' || typeof payload.e !== 'number' || payload.e < now) return null
    return { userId: payload.u }
  } catch {
    return null
  }
}

// ---------- Microsoft ----------

export function authorizeUrl(config: ProjectSyncConfig, redirectUri: string, state: string) {
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: ONEDRIVE_SCOPES,
    state,
    prompt: 'select_account',
  })
  return `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/authorize?${params}`
}

type TokenResponse = { access_token?: string; refresh_token?: string; error?: string; error_description?: string }

async function tokenRequest(config: ProjectSyncConfig, doFetch: typeof fetch, params: Record<string, string>) {
  const response = await doFetch(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, scope: ONEDRIVE_SCOPES, ...params }).toString(),
  })
  const payload = await response.json().catch(() => null) as TokenResponse | null
  return { ok: response.ok && Boolean(payload?.access_token), payload: payload ?? {} }
}

/** Troca o código do login do Paulo pelos tokens e descobre quem conectou. */
export async function connectOneDrive(
  config: ProjectSyncConfig,
  input: { code: string; redirectUri: string; connectedBy: string },
  deps: Pick<ProjectSyncDeps, 'fetch' | 'rpc'>,
): Promise<{ accountEmail: string; fileFound: boolean }> {
  const { ok, payload } = await tokenRequest(config, deps.fetch, { grant_type: 'authorization_code', code: input.code, redirect_uri: input.redirectUri })
  if (!ok || !payload.refresh_token) {
    const consent = /AADSTS65001|AADSTS90094|consent/i.test(payload.error_description ?? '')
    throw new ProjectSyncError(consent ? 'admin' : 'login')
  }
  const auth = { Authorization: `Bearer ${payload.access_token}` }
  const meResponse = await deps.fetch(`${GRAPH}/me?$select=displayName,mail,userPrincipalName`, { headers: auth })
  const me = await meResponse.json().catch(() => null) as { displayName?: string; mail?: string; userPrincipalName?: string } | null
  const accountEmail = me?.mail || me?.userPrincipalName || 'conta Microsoft'
  const fileResponse = await deps.fetch(`${GRAPH}/me/drive/root:/${encodePath(config.filePath)}?$select=id`, { headers: auth })

  const { error } = await deps.rpc('banco1_onedrive_save_connection', {
    account_email: accountEmail,
    account_name: me?.displayName ?? null,
    refresh_token_enc: encryptSecret(payload.refresh_token, config.serverSecret),
    connected_by: input.connectedBy,
  })
  if (error) throw new ProjectSyncError('salvar')
  return { accountEmail, fileFound: fileResponse.ok }
}

/** Token de acesso a partir do refresh token guardado (e guarda o novo refresh token). */
async function accessTokenFromConnection(config: ProjectSyncConfig, deps: ProjectSyncDeps) {
  const { data, error } = await deps.rpc('banco1_onedrive_get_connection')
  const row = (Array.isArray(data) ? data[0] : data) as { account_email?: string; refresh_token_enc?: string } | null
  if (error || !row?.refresh_token_enc) {
    throw new ProjectSyncError('OneDrive ainda não conectado. O Paulo precisa entrar em Projetos e clicar em “Conectar OneDrive”.', 409)
  }
  let refreshToken: string
  try {
    refreshToken = decryptSecret(row.refresh_token_enc, config.serverSecret)
  } catch {
    await deps.rpc('banco1_onedrive_mark_expired', { error_message: 'O segredo do servidor mudou.' })
    throw new ProjectSyncError('A conexão com o OneDrive precisa ser refeita (o segredo do servidor mudou). O Paulo precisa clicar em “Conectar OneDrive”.', 409)
  }
  const { ok, payload } = await tokenRequest(config, deps.fetch, { grant_type: 'refresh_token', refresh_token: refreshToken })
  if (!ok) {
    if (payload.error === 'invalid_grant' || payload.error === 'interaction_required') {
      await deps.rpc('banco1_onedrive_mark_expired', { error_message: 'A Microsoft pediu um novo login.' })
      throw new ProjectSyncError(`A conexão com o OneDrive de ${row.account_email ?? 'Paulo'} expirou (troca de senha ou acesso removido). Ele precisa clicar em “Conectar OneDrive” de novo.`, 409)
    }
    throw new ProjectSyncError('Não foi possível entrar na Microsoft. Confira PROJECTS_SYNC_CLIENT_ID, PROJECTS_SYNC_TENANT_ID e o segredo do app (pode ter vencido).')
  }
  if (payload.refresh_token && payload.refresh_token !== refreshToken) {
    await deps.rpc('banco1_onedrive_update_token', { refresh_token_enc: encryptSecret(payload.refresh_token, config.serverSecret) })
  }
  return payload.access_token!
}

function graphError(status: number, what: string): ProjectSyncError {
  if (status === 401 || status === 403) return new ProjectSyncError(`Sem permissão para ${what} no OneDrive. Reconecte o OneDrive em Projetos.`)
  if (status === 404) return new ProjectSyncError(`Não encontrei ${what} no OneDrive conectado. Confira PROJECTS_SYNC_FILE_PATH.`)
  return new ProjectSyncError(`O OneDrive respondeu com erro ${status} ao ${what}.`)
}

const encodePath = (path: string) => path.split('/').filter(Boolean).map(encodeURIComponent).join('/')

export async function loadSqlJsWasm(): Promise<ArrayBuffer> {
  const require = createRequire(import.meta.url)
  const file = await readFile(require.resolve('sql.js/dist/sql-wasm.wasm'))
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer
}

export function toSyncPayload(projects: EstudosProject[]) {
  return projects.map((project) => ({
    code: project.code,
    supervision_code: project.supervisionCode,
    client: project.client,
    final_client: project.finalClient,
    location: project.location,
    market_segment: project.marketSegment,
    description: project.description,
    active: project.active,
    activities: project.activities.map((activity) => ({
      name: activity.name,
      complement: activity.complement,
      executor_id: null,
      executor_name: activity.executorName,
    })),
  }))
}

export async function runProjectSync(
  config: ProjectSyncConfig,
  options: { trigger: SyncTrigger; requestedBy: string | null },
  deps: ProjectSyncDeps,
): Promise<ProjectSyncResult> {
  let fileEtag: string | null = null
  let fileModifiedAt: string | null = null
  try {
    const token = await accessTokenFromConnection(config, deps)
    const auth = { Authorization: `Bearer ${token}` }
    const base = `${GRAPH}/me/drive`

    const metaResponse = await deps.fetch(`${base}/root:/${encodePath(config.filePath)}?$select=id,eTag,lastModifiedDateTime,size,file`, { headers: auth })
    const meta = await metaResponse.json().catch(() => null) as { id?: string; eTag?: string; lastModifiedDateTime?: string; size?: number; file?: unknown } | null
    if (!metaResponse.ok || !meta?.id) throw graphError(metaResponse.status, 'o arquivo ESTUDOS.sqlite')
    if (!meta.file) throw new ProjectSyncError('O caminho configurado é uma pasta, não o arquivo ESTUDOS.sqlite.')
    if ((meta.size ?? 0) > MAX_FILE_BYTES) throw new ProjectSyncError('O arquivo de projetos passou de 100 MB.')
    fileEtag = meta.eTag ?? null
    fileModifiedAt = meta.lastModifiedDateTime ?? null

    if (options.trigger === 'agendado' && fileEtag) {
      const last = await deps.lastSuccessfulRun()
      if (last?.fileEtag === fileEtag) {
        await deps.rpc('banco1_record_project_sync', {
          sync_trigger: options.trigger, sync_status: 'sem_mudancas', file_etag: fileEtag, file_modified_at: fileModifiedAt, requested_by: null,
        })
        return { status: 'sem_mudancas', fileModifiedAt }
      }
    }

    const contentResponse = await deps.fetch(`${base}/items/${encodeURIComponent(meta.id)}/content`, { headers: auth })
    if (!contentResponse.ok) throw graphError(contentResponse.status, 'baixar o arquivo ESTUDOS.sqlite')
    const bytes = new Uint8Array(await contentResponse.arrayBuffer())
    if (new TextDecoder('latin1').decode(bytes.slice(0, 16)) !== SQLITE_HEADER) {
      throw new ProjectSyncError('O arquivo do OneDrive não é um banco SQLite válido.')
    }

    const SQL = await initSqlJs({ wasmBinary: await (deps.loadWasm ?? loadSqlJsWasm)() })
    const db = new SQL.Database(bytes)
    let projects: EstudosProject[]
    try {
      projects = projectsFromDatabase(db).projects
    } catch (error) {
      throw new ProjectSyncError(error instanceof Error && /projetos/.test(error.message) ? error.message : 'Não foi possível ler o ESTUDOS.sqlite.')
    } finally {
      db.close()
    }

    const { data, error } = await deps.rpc('banco1_sync_projects', {
      projects: toSyncPayload(projects),
      sync_trigger: options.trigger,
      file_etag: fileEtag,
      file_modified_at: fileModifiedAt,
      requested_by: options.requestedBy,
    })
    if (error) throw new ProjectSyncError(`O banco recusou a sincronização: ${error.message}`)
    return { status: 'ok', summary: (data ?? {}) as Record<string, unknown>, fileModifiedAt }
  } catch (error) {
    const message = error instanceof ProjectSyncError ? error.message : 'Falha inesperada na sincronização dos projetos.'
    await deps.rpc('banco1_record_project_sync', {
      sync_trigger: options.trigger, sync_status: 'erro', error_message: message,
      file_etag: fileEtag, file_modified_at: fileModifiedAt, requested_by: options.requestedBy,
    }).catch(() => undefined)
    throw error instanceof ProjectSyncError ? error : new ProjectSyncError(message, 500)
  }
}
