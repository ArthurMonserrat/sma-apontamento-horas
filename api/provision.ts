import type { VercelRequest, VercelResponse } from '../server/types.js'

/**
 * The former MSAL/JIT provisioning path is intentionally unavailable.
 *
 * Corporate authorization must only be re-enabled by a reviewed implementation
 * that validates the Supabase session, Microsoft tenant/object identity,
 * access_preapprovals and profiles.id = auth.users.id. Until then this handler
 * must not read or write profiles and must not initialize service_role.
 */
export async function provision(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' })
    return
  }

  res.status(403).json({ error: 'Corporate authorization is not enabled.' })
}

export default provision
