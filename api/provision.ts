import { createClient } from '@supabase/supabase-js';
import { parse } from 'cookie';
import type { VercelRequest, VercelResponse } from './types.js';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function getSessionToken(req: VercelRequest): string | null {
  const cookieHeader = req.headers?.cookie;
  const rawCookie = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
  if (rawCookie) return parse(rawCookie).sma_session ?? null;
  return req.cookies?.sma_session ?? null;
}

async function getAuthenticatedMicrosoftUser(req: VercelRequest) {
  const accessToken = getSessionToken(req);
  if (!accessToken) return null;

  const response = await fetch('https://graph.microsoft.com/v1.0/me?$select=displayName,userPrincipalName,mail', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;

  const account = await response.json() as { displayName?: string; userPrincipalName?: string; mail?: string | null };
  const authenticatedEmail = account.userPrincipalName ?? account.mail;
  if (!isNonEmptyString(authenticatedEmail) || !isNonEmptyString(account.displayName)) return null;
  return { email: authenticatedEmail.trim().toLowerCase(), fullName: account.displayName.trim() };
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured on the server.');
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function findByEmail(supabase: ReturnType<typeof getSupabaseAdmin>, email: string) {
  return supabase.from('profiles').select('*').eq('email', email).maybeSingle();
}

function isKnownRole(value: unknown): value is 'colaborador' | 'supervisor' | 'diretor' {
  return value === 'colaborador' || value === 'supervisor' || value === 'diretor';
}

export async function provision(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    const authenticatedUser = await getAuthenticatedMicrosoftUser(req);
    if (!authenticatedUser) {
      res.status(401).json({ error: 'Authenticated Microsoft session is required.' });
      return;
    }
    const supabase = getSupabaseAdmin();
    const existing = await findByEmail(supabase, authenticatedUser.email);
    if (existing.error) throw existing.error;
    if (!existing.data) {
      res.status(403).json({ error: 'Corporate profile is not provisioned.' });
      return;
    }
    if (existing.data.active !== true) {
      res.status(403).json({ error: 'Corporate profile is inactive.' });
      return;
    }
    if (!isKnownRole(existing.data.role)) {
      res.status(403).json({ error: 'Corporate profile has an invalid role.' });
      return;
    }
    if (!isNonEmptyString(existing.data.id) || !isNonEmptyString(existing.data.email)) {
      res.status(403).json({ error: 'Corporate profile is incomplete.' });
      return;
    }
    res.status(200).json({ profile: existing.data });
  } catch (error) {
    console.error('[provision] Corporate profile lookup failed:', error);
    res.status(500).json({ error: 'Could not validate corporate profile.' });
  }
}

export default provision;
