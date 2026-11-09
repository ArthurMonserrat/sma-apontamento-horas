import initSqlJs from 'sql.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createProjectsSyncHandler } from '../../api/projects-sync.js'
import { decryptSecret, encryptSecret, readProjectSyncConfig, signState, verifyState } from '../../server/projectSync.js'
import type { VercelRequest } from '../../server/types.js'

const TOKEN = 'x'.repeat(40)
const env = {
  SUPABASE_URL: 'https://db.example.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  PROJECTS_SYNC_TOKEN: TOKEN,
  TENANT_ID: 'tenant',
  CLIENT_ID: 'client',
  CLIENT_SECRET: 'client-secret-value',
  PROJECTS_SYNC_FILE_PATH: '/Controle/ESTUDOS.sqlite',
  PROJECTS_SYNC_APP_URL: 'https://app.example.com/',
}
const ME_DRIVE = 'https://graph.microsoft.com/v1.0/me/drive'

async function sqliteFile() {
  const SQL = await initSqlJs()
  const db = new SQL.Database()
  db.run(`create table projeto (codigo text, supervisao text, cliente text, cliente_final text, local text, seg_mercado text, descricao text, status text);
    create table atividade (id text, projeto text, ordem real, atividade text, complemento text, executor_manual text);
    insert into projeto values ('25A163E', 'S2-BAA', 'APPIAN', null, 'Itagibá/BA', 'Mineração', 'Santa Rita', 'Em andamento'), ('24A001E', null, 'VALE', null, null, null, 'Antigo', 'Concluído');
    insert into atividade values ('a1', '25A163E', 1, 'Curto-circuito', null, 'Bruna Alvarenga');`)
  return db.export()
}

let file: Uint8Array
let rpcCalls: Array<{ name: string; args: Record<string, unknown> }>
let lastEtag: string | null
let isDirector: boolean
let storedToken: string | null
let graph: ReturnType<typeof vi.fn>
let tokenResponse: () => Response

function response(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, arrayBuffer: async () => body as ArrayBuffer } as Response
}

function fakeSupabase() {
  return vi.fn((_url: string, key: string) => ({
    auth: { getUser: async (token: string) => token === 'user-jwt' ? { data: { user: { id: 'director-1' } }, error: null } : { data: { user: null }, error: { message: 'bad' } } },
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      if (key === 'anon') return name === 'banco1_can_sync_projects' ? { data: isDirector, error: null } : { data: null, error: { message: 'no' } }
      rpcCalls.push({ name, args })
      if (name === 'banco1_onedrive_get_connection') return { data: storedToken ? [{ account_email: 'paulo.porto@sma-eng.com.br', refresh_token_enc: storedToken, status: 'ativa' }] : [], error: null }
      if (name === 'banco1_onedrive_save_connection' || name === 'banco1_onedrive_update_token') storedToken = args.refresh_token_enc as string
      return { data: name === 'banco1_sync_projects' ? { projects_created: 2, activities_saved: 1 } : null, error: null }
    },
    from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: lastEtag ? { file_etag: lastEtag } : null }) }) }) }) }) }),
  }))
}

function makeRes() {
  const res = { statusCode: 0, body: undefined as unknown, redirectedTo: '' }
  const api = {
    status(code: number) { res.statusCode = code; return api },
    json(body: unknown) { res.body = body },
    setHeader() {},
    redirect(url: string) { res.redirectedTo = url; res.statusCode = 302 },
  }
  return { res, api }
}

const request = (headers: Record<string, string>, method = 'POST', query: Record<string, string> = {}) => ({ method, headers, query }) as VercelRequest

beforeEach(async () => {
  file = await sqliteFile()
  rpcCalls = []
  lastEtag = null
  isDirector = true
  storedToken = encryptSecret('refresh-1', TOKEN)
  tokenResponse = () => response(200, { access_token: 'graph-token', refresh_token: 'refresh-2' })
  graph = vi.fn(async (url: string) => {
    if (url === 'https://login.microsoftonline.com/tenant/oauth2/v2.0/token') return tokenResponse()
    if (url === 'https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName') return response(200, { displayName: 'Paulo Porto', mail: 'paulo.porto@sma-eng.com.br' })
    if (url === `${ME_DRIVE}/root:/Controle/ESTUDOS.sqlite?$select=id`) return response(200, { id: 'item-1' })
    if (url.startsWith(`${ME_DRIVE}/root:/Controle/ESTUDOS.sqlite?`)) {
      return response(200, { id: 'item-1', eTag: '"etag-2"', lastModifiedDateTime: '2026-11-10T12:00:00Z', size: file.byteLength, file: {} })
    }
    if (url === `${ME_DRIVE}/items/item-1/content`) return response(200, file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength))
    return response(404, {})
  })
})

const handler = (overrides: Record<string, string> = {}) => createProjectsSyncHandler({ env: { ...env, ...overrides }, createSupabase: fakeSupabase() as never, fetch: graph as unknown as typeof fetch })

describe('POST /api/projects-sync (sincronizar)', () => {
  it('agendamento usa a conexão do Paulo, baixa o arquivo e espelha os projetos', async () => {
    const { res, api } = makeRes()
    await handler()(request({ 'x-sync-token': TOKEN }), api)
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ status: 'ok', summary: { projects_created: 2 } })
    const tokenBody = String(graph.mock.calls[0][1].body)
    expect(tokenBody).toContain('grant_type=refresh_token')
    expect(tokenBody).toContain('refresh_token=refresh-1')
    // refresh token novo guardado criptografado
    expect(decryptSecret(storedToken!, TOKEN)).toBe('refresh-2')
    const sync = rpcCalls.find((call) => call.name === 'banco1_sync_projects')!
    expect(sync.args).toMatchObject({ sync_trigger: 'agendado', file_etag: '"etag-2"', requested_by: null })
    expect(sync.args.projects).toEqual([
      { code: '24A001E', supervision_code: null, client: 'VALE', final_client: null, location: null, market_segment: null, description: 'Antigo', active: false, activities: [] },
      { code: '25A163E', supervision_code: 'S2-BAA', client: 'APPIAN', final_client: null, location: 'Itagibá/BA', market_segment: 'Mineração', description: 'Santa Rita', active: true,
        activities: [{ name: 'Curto-circuito', complement: null, executor_id: null, executor_name: 'Bruna Alvarenga' }] },
    ])
  })

  it('agendamento não baixa de novo se o arquivo não mudou', async () => {
    lastEtag = '"etag-2"'
    const { res, api } = makeRes()
    await handler()(request({ 'x-sync-token': TOKEN }), api)
    expect(res.body).toMatchObject({ status: 'sem_mudancas' })
    expect(graph.mock.calls.some(([url]) => String(url).endsWith('/content'))).toBe(false)
  })

  it('diretoria sincroniza na hora', async () => {
    lastEtag = '"etag-2"'
    const { res, api } = makeRes()
    await handler()(request({ authorization: 'Bearer user-jwt' }), api)
    expect(res.statusCode).toBe(200)
    expect(rpcCalls.find((call) => call.name === 'banco1_sync_projects')!.args).toMatchObject({ sync_trigger: 'manual', requested_by: 'director-1' })
  })

  it('avisa quando o OneDrive ainda não foi conectado', async () => {
    storedToken = null
    const { res, api } = makeRes()
    await handler()(request({ 'x-sync-token': TOKEN }), api)
    expect(res.statusCode).toBe(409)
    expect((res.body as { error: string }).error).toContain('Conectar OneDrive')
    expect(rpcCalls.at(-1)).toMatchObject({ name: 'banco1_record_project_sync', args: { sync_status: 'erro' } })
  })

  it('marca a conexão como expirada quando a Microsoft pede novo login', async () => {
    tokenResponse = () => response(400, { error: 'invalid_grant' })
    const { res, api } = makeRes()
    await handler()(request({ 'x-sync-token': TOKEN }), api)
    expect(res.statusCode).toBe(409)
    expect((res.body as { error: string }).error).toContain('expirou')
    expect(rpcCalls.some((call) => call.name === 'banco1_onedrive_mark_expired')).toBe(true)
  })

  it('erro claro quando o arquivo não existe', async () => {
    graph.mockImplementation(async (url: string) => url.includes('/token') ? tokenResponse() : response(404, {}))
    const { res, api } = makeRes()
    await handler()(request({ 'x-sync-token': TOKEN }), api)
    expect(res.statusCode).toBe(502)
    expect((res.body as { error: string }).error).toContain('PROJECTS_SYNC_FILE_PATH')
    expect(JSON.stringify(res.body)).not.toContain('client-secret-value')
  })

  it('recusa quem não é diretoria, token errado e GET simples', async () => {
    isDirector = false
    let { res, api } = makeRes()
    await handler()(request({ authorization: 'Bearer user-jwt' }), api)
    expect(res.statusCode).toBe(403)
    ;({ res, api } = makeRes())
    await handler()(request({ 'x-sync-token': 'y'.repeat(40) }), api)
    expect(res.statusCode).toBe(401)
    ;({ res, api } = makeRes())
    await handler()(request({}, 'GET'), api)
    expect(res.statusCode).toBe(405)
    expect(rpcCalls).toHaveLength(0)
  })

  it('avisa o que falta configurar', async () => {
    expect(readProjectSyncConfig({ TENANT_ID: 't' }).missing).toEqual(['PROJECTS_SYNC_CLIENT_ID', 'PROJECTS_SYNC_CLIENT_SECRET', 'PROJECTS_SYNC_FILE_PATH', 'PROJECTS_SYNC_TOKEN'])
    const { res, api } = makeRes()
    await handler({ PROJECTS_SYNC_FILE_PATH: '' })(request({ authorization: 'Bearer user-jwt' }), api)
    expect(res.statusCode).toBe(503)
    expect((res.body as { error: string }).error).toContain('PROJECTS_SYNC_FILE_PATH')
  })
})

describe('Conectar OneDrive', () => {
  it('diretoria recebe o link de login da Microsoft com permissão só de leitura', async () => {
    const { res, api } = makeRes()
    await handler()(request({ authorization: 'Bearer user-jwt' }, 'POST', { action: 'connect' }), api)
    expect(res.statusCode).toBe(200)
    const link = new URL((res.body as { url: string }).url)
    expect(link.origin + link.pathname).toBe('https://login.microsoftonline.com/tenant/oauth2/v2.0/authorize')
    expect(link.searchParams.get('scope')).toBe('offline_access User.Read Files.Read')
    expect(link.searchParams.get('redirect_uri')).toBe('https://app.example.com/api/projects-sync')
    expect(verifyState(link.searchParams.get('state')!, TOKEN)).toEqual({ userId: 'director-1' })
  })

  it('o token do agendamento não serve para conectar', async () => {
    const { res, api } = makeRes()
    await handler()(request({ 'x-sync-token': TOKEN }, 'POST', { action: 'connect' }), api)
    expect(res.statusCode).toBe(401)
  })

  it('volta do login: guarda o refresh token criptografado e devolve para a tela', async () => {
    storedToken = null
    tokenResponse = () => response(200, { access_token: 'graph-token', refresh_token: 'refresh-novo' })
    const state = signState('director-1', TOKEN)
    const { res, api } = makeRes()
    await handler()(request({}, 'GET', { code: 'abc', state }), api)
    expect(res.redirectedTo).toBe('https://app.example.com/#/administracao/projetos?onedrive=conectado&conta=paulo.porto%40sma-eng.com.br&arquivo=ok')
    const body = String(graph.mock.calls[0][1].body)
    expect(body).toContain('grant_type=authorization_code')
    expect(body).toContain('redirect_uri=https%3A%2F%2Fapp.example.com%2Fapi%2Fprojects-sync')
    const save = rpcCalls.find((call) => call.name === 'banco1_onedrive_save_connection')!
    expect(save.args).toMatchObject({ account_email: 'paulo.porto@sma-eng.com.br', connected_by: 'director-1' })
    expect(String(save.args.refresh_token_enc)).not.toContain('refresh-novo')
    expect(decryptSecret(String(save.args.refresh_token_enc), TOKEN)).toBe('refresh-novo')
  })

  it('volta do login com state falso, cancelado ou bloqueado pela empresa', async () => {
    let { res, api } = makeRes()
    await handler()(request({}, 'GET', { code: 'abc', state: signState('director-1', 'outro-segredo-'.repeat(4)) }), api)
    expect(res.redirectedTo).toContain('onedrive=erro&motivo=state')
    ;({ res, api } = makeRes())
    await handler()(request({}, 'GET', { error: 'access_denied', state: signState('director-1', TOKEN) }), api)
    expect(res.redirectedTo).toContain('motivo=cancelado')
    ;({ res, api } = makeRes())
    await handler()(request({}, 'GET', { error: 'access_denied', error_description: 'AADSTS90094: admin consent required', state: signState('director-1', TOKEN) }), api)
    expect(res.redirectedTo).toContain('motivo=admin')
    expect(rpcCalls.some((call) => call.name === 'banco1_onedrive_save_connection')).toBe(false)
  })

  it('state expira e criptografia não abre com outro segredo', () => {
    const state = signState('u1', TOKEN, 0)
    expect(verifyState(state, TOKEN, 16 * 60 * 1000)).toBeNull()
    expect(() => decryptSecret(encryptSecret('abc', TOKEN), 'z'.repeat(40))).toThrow()
  })
})
