import { isLegacyMsalAllowed } from './corporateAuthPolicy.js'
import type { VercelRequest, VercelResponse } from './types.js'

export function assertLegacyMsalEnabled(_req: VercelRequest, res: VercelResponse): boolean {
  if (isLegacyMsalAllowed()) return true
  res.status(404).json({ error: 'Legacy authentication is disabled.' })
  return false
}
