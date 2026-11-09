import { randomUUID, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { readBearerToken } from '../server/corporateAuthPolicy.js'
import {
  ProjectSyncError,
  authorizeUrl,
  connectOneDrive,
  readProjectSyncConfig,
  runProjectSync,
  signState,
  verifyState,
  type ProjectSyncDeps,
  type SyncTrigger,
} from '../server/projectSync.js'
import type { VercelRequest, VercelResponse } from '../server/types.js'

/**
 * /api/projects-sync — projetos do Banco 1 x ESTUDOS.sqlite no OneDrive (pasta BD ESTUDOS).
 * - POST                     sincroniza (agendamento com x-sync-token, ou diretoria com Bearer).
 * - POST ?action=connect     diretoria pede o link de login da Microsoft ("Conectar OneDrive").
 * - GET  ?code=…&state=…     volta do login da Microsoft (redirect URI do app).
 */

function headerValue(req: VercelRequest, name: string): string | undefined {
  const value = req.headers?.[name]
  return Array.isArray(value) ? value[0] : value
}

function queryValue(req: VercelRequest, name: string): string | undefined {
  const value = req.query?.[name]
  return Array.isArray(value) ? value[0] : value
}

function sameSecret(received: string | undefined, expected: string | undefined) {
  if (!received || !expected || expected.length < 32) return false
  const left = Buffer.from(received)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}

/** Endereço público do site (para o redirect URI e a volta para a tela). */
function appUrl(req: VercelRequest, env: Record<string, string | undefined>) {
  const configured = env.PROJECTS_SYNC_APP_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')
  const host = headerValue(req, 'x-forwarded-host') ?? headerValue(req, 'host') ?? 'localhost'
  const proto = headerValue(req, 'x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

const CALLBACK_REASONS: Record<string, string> = {
  admin: 'admin',
  login: 'login',
  salvar: 'salvar',
}

export type ProjectsSyncHandlerDeps = {
  env?: Record<string, string | undefined>
  createSupabase?: typeof createClient
  fetch?: typeof fetch
  loadWasm?: ProjectSyncDeps['loadWasm']
}

export function createProjectsSyncHandler(deps: ProjectsSyncHandlerDeps = {}) {
  return async function handler(req: VercelRequest, res: VercelResponse) {
    const requestId = randomUUID()
    res.setHeader('Cache-Control', 'no-store')
    const env = deps.env ?? process.env
    const make = deps.createSupabase ?? createClient
    const doFetch = deps.fetch ?? fetch
    const url = env.SUPABASE_URL
    const anonKey = env.SUPABASE_ANON_KEY
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
    const site = appUrl(req, env)
    const redirectUri = `${site}/api/projects-sync`
    const backToScreen = (params: Record<string, string>) => `${site}/#/administracao/projetos?${new URLSearchParams(params)}`

    if (!url || !anonKey || !serviceRoleKey) {
      res.status(503).json({ error: 'Configuração do Supabase incompleta no servidor.', requestId })
      return
    }
    const { config, missing } = readProjectSyncConfig(env)
    const service = make(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const rpc: ProjectSyncDeps['rpc'] = async (name, args = {}) => {
      const { data, error } = await service.rpc(name, args)
      return { data, error: error ? { message: error.message } : null }
    }

    // ---- Volta do login da Microsoft ----
    if (req.method === 'GET') {
      const code = queryValue(req, 'code')
      const state = queryValue(req, 'state')
      const msError = queryValue(req, 'error')
      if (!state && !code && !msError) {
        res.setHeader('Allow', 'POST')
        res.status(405).json({ error: 'Use POST.', requestId })
        return
      }
      if (!config) {
        res.redirect(backToScreen({ onedrive: 'erro', motivo: 'config' }))
        return
      }
      const verified = state ? verifyState(state, config.serverSecret) : null
      if (!verified) {
        res.redirect(backToScreen({ onedrive: 'erro', motivo: 'state' }))
        return
      }
      if (msError || !code) {
        const description = queryValue(req, 'error_description') ?? ''
        const reason = /AADSTS65001|AADSTS90094|admin/i.test(description) ? 'admin' : msError === 'access_denied' ? 'cancelado' : 'login'
        res.redirect(backToScreen({ onedrive: 'erro', motivo: reason }))
        return
      }
      try {
        const result = await connectOneDrive(config, { code, redirectUri, connectedBy: verified.userId }, { fetch: doFetch, rpc })
        res.redirect(backToScreen({ onedrive: 'conectado', conta: result.accountEmail, arquivo: result.fileFound ? 'ok' : 'nao-encontrado' }))
      } catch (error) {
        const reason = error instanceof ProjectSyncError ? CALLBACK_REASONS[error.message] ?? 'login' : 'login'
        console.error('[projects-sync] falha ao conectar OneDrive', { requestId, reason })
        res.redirect(backToScreen({ onedrive: 'erro', motivo: reason }))
      }
      return
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST')
      res.status(405).json({ error: 'Use POST.', requestId })
      return
    }

    // ---- Quem está chamando? ----
    let trigger: SyncTrigger
    let requestedBy: string | null = null
    if (sameSecret(headerValue(req, 'x-sync-token'), env.PROJECTS_SYNC_TOKEN) && queryValue(req, 'action') !== 'connect') {
      trigger = 'agendado'
    } else {
      const token = readBearerToken(req)
      if (!token) {
        res.status(401).json({ error: 'Entre no sistema para continuar.', requestId })
        return
      }
      const userClient = make(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      })
      const { data: userData, error: userError } = await userClient.auth.getUser(token)
      if (userError || !userData?.user) {
        res.status(401).json({ error: 'Sessão inválida. Entre novamente.', requestId })
        return
      }
      const { data: allowed, error: roleError } = await userClient.rpc('banco1_can_sync_projects')
      if (roleError || allowed !== true) {
        res.status(403).json({ error: 'Somente a diretoria pode usar a sincronização dos projetos.', requestId })
        return
      }
      trigger = 'manual'
      requestedBy = userData.user.id
    }

    if (!config) {
      res.status(503).json({ error: `Sincronização com o OneDrive ainda não configurada na Vercel (faltam: ${missing.join(', ')}).`, requestId })
      return
    }

    // ---- "Conectar OneDrive" ----
    if (queryValue(req, 'action') === 'connect') {
      res.status(200).json({ url: authorizeUrl(config, redirectUri, signState(requestedBy!, config.serverSecret)), redirectUri, requestId })
      return
    }

    // ---- Sincronizar ----
    try {
      const result = await runProjectSync(config, { trigger, requestedBy }, {
        fetch: doFetch,
        loadWasm: deps.loadWasm,
        rpc,
        lastSuccessfulRun: async () => {
          const { data } = await service
            .from('banco1_project_sync_runs')
            .select('file_etag')
            .eq('status', 'ok')
            .order('started_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          return data ? { fileEtag: (data as { file_etag: string | null }).file_etag } : null
        },
      })
      res.status(200).json({ ...result, requestId })
    } catch (error) {
      const status = error instanceof ProjectSyncError ? error.httpStatus : 500
      const message = error instanceof Error ? error.message : 'Falha na sincronização.'
      console.error('[projects-sync] falha', { requestId, trigger, message })
      res.status(status).json({ error: message, requestId })
    }
  }
}

export default createProjectsSyncHandler()
