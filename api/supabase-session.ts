import { createClient } from '@supabase/supabase-js'
import { readBearerToken } from '../server/corporateAuthPolicy.js'
import type { CorporateProfile } from '../frontend/src/features/session/types.js'
import type { VercelRequest, VercelResponse } from '../server/types.js'

const CORPORATE_ROLES = new Set(['colaborador', 'supervisor', 'diretor'])

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY
  if (!url || !anonKey) throw new Error('Supabase server session configuration is incomplete.')
  return { url, anonKey }
}

function isAzureAuthUser(user: { app_metadata?: Record<string, unknown> }): boolean {
  return user.app_metadata?.provider === 'azure'
}

function isCorporateProfile(profile: unknown): profile is CorporateProfile {
  if (!profile || typeof profile !== 'object') return false
  const candidate = profile as Partial<CorporateProfile>
  return typeof candidate.id === 'string'
    && typeof candidate.email === 'string'
    && typeof candidate.full_name === 'string'
    && typeof candidate.role === 'string'
    && CORPORATE_ROLES.has(candidate.role)
    && (typeof candidate.squad_id === 'string' || candidate.squad_id === null)
    && candidate.active === true
}

export async function supabaseSession(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed.' })
    return
  }

  const accessToken = readBearerToken(req)
  if (!accessToken) {
    res.status(401).json({ error: 'Supabase bearer token is required.' })
    return
  }

  try {
    const { url, anonKey } = getSupabaseConfig()
    const authClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: authData, error: authError } = await authClient.auth.getUser(accessToken)
    const user = authData?.user
    if (authError || !user) {
      res.status(401).json({ error: 'Invalid Supabase session.' })
      return
    }

    if (!isAzureAuthUser(user)) {
      res.status(403).json({ error: 'A Microsoft corporate identity is required.' })
      return
    }

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: profile, error: profileError } = await userClient
      .from('profiles')
      .select('id,email,full_name,role,squad_id,active,created_at,updated_at')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (profileError) {
      if (profileError.code === 'PGRST116') {
        res.status(403).json({ error: 'Corporate profile is missing or ambiguous.' })
        return
      }
      res.status(500).json({ error: 'Could not load corporate profile.' })
      return
    }

    if (!isCorporateProfile(profile)) {
      res.status(403).json({ error: 'No active corporate profile is available for this account.' })
      return
    }

    res.status(200).json({ profile })
  } catch {
    res.status(500).json({ error: 'Could not validate Supabase session.' })
  }
}

export default supabaseSession
