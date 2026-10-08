import { serialize } from 'cookie';

import {
  createMsalClient,
  getAuthenticationSettings,
  USER_READ_SCOPE,
} from './msal.js';
import type { VercelRequest, VercelResponse } from './types.js';

export async function redirect(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.query.error) {
    res.status(400).json({ error: 'Microsoft authorization was not completed.' });
    return;
  }

  const code = req.query.code;
  if (typeof code !== 'string' || code.length === 0) {
    res.status(400).json({ error: 'Authorization code is required.' });
    return;
  }

  try {
    const settings = getAuthenticationSettings();
    const authenticationResult = await createMsalClient(settings).acquireTokenByCode({
      code,
      redirectUri: settings.redirectUri,
      scopes: USER_READ_SCOPE,
    });

    if (!authenticationResult?.accessToken) {
      throw new Error('Microsoft did not return an access token.');
    }

    res.setHeader(
      'Set-Cookie',
      serialize('sma_session', authenticationResult.accessToken, {
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      }),
    );
    res.redirect(`${settings.frontendUrl.replace(/\/$/, '')}/`);
  } catch {
    res.status(500).json({ error: 'Authentication could not be completed.' });
  }
}

export default redirect;
