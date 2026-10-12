import { parse } from 'cookie';
import type { VercelRequest, VercelResponse } from '../server/types.js';
import { assertLegacyMsalEnabled } from '../server/legacyMsalGuard.js';

type MicrosoftProfile = {
  id?: string;
  displayName?: string;
  userPrincipalName?: string;
  mail?: string | null;
};

function getSessionToken(req: VercelRequest): string | null {
  const cookieHeader = req.headers?.cookie;
  const rawCookie = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
  if (rawCookie) return parse(rawCookie).sma_session ?? null;
  return req.cookies?.sma_session ?? null;
}

export async function me(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!assertLegacyMsalEnabled(req, res)) return;
  const accessToken = getSessionToken(req);
  if (!accessToken) {
    res.status(401).json({ isAuthenticated: false });
    return;
  }

  try {
    const response = await fetch('https://graph.microsoft.com/v1.0/me?$select=id,displayName,userPrincipalName,mail', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      res.status(401).json({ isAuthenticated: false });
      return;
    }

    const account = (await response.json()) as MicrosoftProfile;
    const username = account.userPrincipalName ?? account.mail;
    if (!account.id || !account.displayName || !username) {
      res.status(401).json({ isAuthenticated: false });
      return;
    }

    res.json({
      isAuthenticated: true,
      account: { id: account.id, name: account.displayName, username },
    });
  } catch {
    res.status(401).json({ isAuthenticated: false });
  }
}

export default me;
