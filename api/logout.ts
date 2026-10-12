import { serialize } from 'cookie';
import type { VercelRequest, VercelResponse } from '../server/types.js';
import { assertLegacyMsalEnabled } from '../server/legacyMsalGuard.js';

export function logout(req: VercelRequest, res: VercelResponse): void {
  if (!assertLegacyMsalEnabled(req, res)) return;
  res.setHeader('Set-Cookie', serialize('sma_session', '', {
    expires: new Date(0),
    httpOnly: true,
    maxAge: 0,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  }));
  res.redirect('/login');
}

export default logout;
