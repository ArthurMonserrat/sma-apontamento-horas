import {
  createMsalClient,
  getAuthenticationSettings,
  USER_READ_SCOPE,
} from './msal.js';
import type { VercelRequest, VercelResponse } from './types.js';
import { assertLegacyMsalEnabled } from './legacyMsalGuard.js';

export async function login(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!assertLegacyMsalEnabled(req, res)) return;
  try {
    const settings = getAuthenticationSettings();
    const authorizationUrl = await createMsalClient(settings).getAuthCodeUrl({
      redirectUri: settings.redirectUri,
      scopes: USER_READ_SCOPE,
    });

    res.redirect(authorizationUrl);
  } catch {
    res.status(500).json({ error: 'Authentication configuration is unavailable.' });
  }
}

export default login;
