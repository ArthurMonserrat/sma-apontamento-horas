import { createClient } from '@supabase/supabase-js'
import { isCorporateAuthorizationReady, readBearerToken } from '../server/corporateAuthPolicy.js'
import type { VercelRequest, VercelResponse } from '../server/types.js'

function getSupabasePublicClient() {
  const url = process.env.SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY
  if (!url || !anonKey) throw new Error('Supabase server session configuration is incomplete.')

  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
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
    const supabase = getSupabasePublicClient()
    const { data, error } = await supabase.auth.getUser(accessToken)
    if (error || !data.user) {
      res.status(401).json({ error: 'Invalid Supabase session.' })
      return
    }

    // Stage 2 deliberately has no corporate authorization implementation yet.
    // This remains false even when an environment flag is accidentally enabled.
    if (!isCorporateAuthorizationReady()) {
      res.status(403).json({ error: 'Corporate authorization is not enabled.' })
      return
    }

    // The definitive identity/pre-authorization/profile read is intentionally
    // not reachable until a reviewed implementation turns the hard gate on.
    res.status(403).json({ error: 'Corporate authorization is not enabled.' })
  } catch {
    res.status(500).json({ error: 'Could not validate Supabase session.' })
  }
}

export default supabaseSession
