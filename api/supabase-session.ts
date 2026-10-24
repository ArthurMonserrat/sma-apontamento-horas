import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { readBearerToken } from '../server/corporateAuthPolicy.js'
import type { CorporateProfile } from '../frontend/src/features/session/types.js'
import type { VercelRequest, VercelResponse } from '../server/types.js'

const CORPORATE_ROLES = new Set(['colaborador', 'supervisor', 'diretor'])

/** Etapa em que a validação parou; vai no log e na resposta para facilitar o debug. */
type SessionStage = 'config' | 'auth' | 'profile_query' | 'profile_validation'

type ProfileRejection = 'profile_not_found' | 'profile_inactive' | 'profile_role_unknown' | 'profile_shape_invalid'

function headerValue(req: VercelRequest, name: string): string | undefined {
  const value = req.headers?.[name]
  return Array.isArray(value) ? value[0] : value
}

/** Usa apenas IDs de requisição com formato seguro; caso contrário cria um ID local. */
function getRequestId(req: VercelRequest): string {
  const vercelId = headerValue(req, 'x-vercel-id')
  return vercelId && /^[a-zA-Z0-9._:-]{1,128}$/.test(vercelId) ? vercelId : randomUUID()
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const missing = [
    !url && 'SUPABASE_URL',
    !anonKey && 'SUPABASE_ANON_KEY',
    !serviceRoleKey && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean)
  if (missing.length > 0 || !url || !anonKey || !serviceRoleKey) {
    throw new Error(`Supabase server session configuration is incomplete: missing ${missing.join(', ')}.`)
  }
  return { url, anonKey, serviceRoleKey }
}

function isAzureAuthUser(user: { app_metadata?: Record<string, unknown> }): boolean {
  return user.app_metadata?.provider === 'azure'
}

function isCorporateRole(role: string): role is CorporateProfile['role'] {
  return CORPORATE_ROLES.has(role)
}

/**
 * Converte a linha do banco no contrato CorporateProfile.
 * Recebe apenas os campos suportados pelo contrato corporativo, sem propagar
 * colunas internas ou dependentes de schema entre ambientes.
 */
function toCorporateProfile(row: unknown): { profile: CorporateProfile } | { rejection: ProfileRejection } {
  if (!row || typeof row !== 'object') return { rejection: 'profile_not_found' }
  const candidate = row as Record<string, unknown>
  if (typeof candidate.id !== 'string'
    || typeof candidate.email !== 'string'
    || typeof candidate.full_name !== 'string'
    || typeof candidate.role !== 'string') {
    return { rejection: 'profile_shape_invalid' }
  }
  if (!isCorporateRole(candidate.role)) return { rejection: 'profile_role_unknown' }
  if (candidate.active !== true) return { rejection: 'profile_inactive' }

  return {
    profile: {
      id: candidate.id,
      email: candidate.email,
      full_name: candidate.full_name,
      role: candidate.role,
      active: true,
    },
  }
}

export async function supabaseSession(req: VercelRequest, res: VercelResponse): Promise<void> {
  const requestId = getRequestId(req)
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Request-Id', requestId)

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed.', requestId })
    return
  }

  const accessToken = readBearerToken(req)
  if (!accessToken) {
    res.status(401).json({ error: 'Supabase bearer token is required.', requestId, stage: 'auth' })
    return
  }

  let stage: SessionStage = 'config'
  let userId: string | undefined

  try {
    const { url, anonKey, serviceRoleKey } = getSupabaseConfig()

    stage = 'auth'
    const authClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })
    const { data: authData, error: authError } = await authClient.auth.getUser(accessToken)
    const user = authData?.user
    if (authError || !user) {
      console.warn('[api/supabase-session] Token rejected', {
        requestId,
        status: (authError as { status?: number } | null)?.status,
      })
      res.status(401).json({ error: 'Invalid Supabase session.', requestId, stage })
      return
    }
    userId = user.id

    if (!isAzureAuthUser(user)) {
      res.status(403).json({ error: 'A Microsoft corporate identity is required.', requestId, stage })
      return
    }

    // O bearer foi validado acima; a chave da linha vem só do usuário verificado.
    // A service role fica apenas nesta função serverless, nunca em VITE_*.
    stage = 'profile_query'
    const profileClient = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })
    const { data: row, error: profileError } = await profileClient
      .from('profiles')
      .select('id,email,full_name,role,active')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      if (profileError.code === 'PGRST116') {
        res.status(403).json({ error: 'Corporate profile is missing or ambiguous.', requestId, stage, code: profileError.code })
        return
      }
      console.error('[api/supabase-session] Profile lookup failed', {
        requestId,
        userId,
        code: profileError.code,
      })
      res.status(500).json({
        error: 'Could not load corporate profile.',
        requestId,
        stage,
        // Códigos do Postgres/PostgREST são úteis para diagnóstico e não incluem credenciais.
        code: profileError.code ?? null,
      })
      return
    }

    stage = 'profile_validation'
    const result = toCorporateProfile(row)
    if ('rejection' in result) {
      console.warn('[api/supabase-session] Profile rejected', { requestId, userId, reason: result.rejection })
      res.status(403).json({
        error: 'No active corporate profile is available for this account.',
        requestId,
        stage,
        reason: result.rejection,
      })
      return
    }

    res.status(200).json({ profile: result.profile })
  } catch (error) {
    const errorName = error instanceof Error ? error.name : 'UnknownError'
    const errorCode = error && typeof error === 'object' && 'code' in error
      && typeof error.code === 'string'
      ? error.code
      : undefined
    console.error('[api/supabase-session] Session validation failed', {
      requestId,
      stage,
      userId,
      errorName,
      ...(errorCode ? { code: errorCode } : {}),
    })
    res.status(500).json({
      error: 'Could not validate Supabase session.',
      requestId,
      stage,
    })
  }
}

export default supabaseSession
