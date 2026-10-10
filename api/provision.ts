import { createClient } from '@supabase/supabase-js';
import { parse } from 'cookie';
import type { VercelRequest, VercelResponse } from './types.js';

type ProvisionBody = {
  email?: unknown;
  fullName?: unknown;
};

function readBody(req: VercelRequest): ProvisionBody {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return {};
  return req.body as ProvisionBody;
}

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

export async function provision(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const { email, fullName } = readBody(req);
  const normalizedEmail = isNonEmptyString(email) ? email.trim().toLowerCase() : '';
  const normalizedFullName = isNonEmptyString(fullName) ? fullName.trim() : '';

  if (!normalizedEmail || !normalizedFullName) {
    res.status(400).json({ error: 'email and fullName are required.' });
    return;
  }

  try {
    const authenticatedUser = await getAuthenticatedMicrosoftUser(req);
    if (!authenticatedUser) {
      res.status(401).json({ error: 'Authenticated Microsoft session is required.' });
      return;
    }
    if (authenticatedUser.email !== normalizedEmail) {
      res.status(403).json({ error: 'The requested profile does not match the authenticated user.' });
      return;
    }
    const authoritativeFullName = authenticatedUser.fullName;

    const supabase = getSupabaseAdmin();
    const existing = await findByEmail(supabase, normalizedEmail);
    if (existing.error) throw existing.error;
    if (existing.data) {
      res.status(200).json({ profile: existing.data });
      return;
    }

    const created = await supabase.from('profiles').insert({
      email: normalizedEmail,
      full_name: authoritativeFullName,
    }).select('*').single();

    if (!created.error && created.data) {
      res.status(201).json({ profile: created.data });
      return;
    }

    // Another request may have provisioned the same user between the lookup and insert.
    if (created.error?.code === '23505') {
      const racedProfile = await findByEmail(supabase, normalizedEmail);
      if (!racedProfile.error && racedProfile.data) {
        res.status(200).json({ profile: racedProfile.data });
        return;
      }
    }

    throw created.error ?? new Error('Could not create corporate profile.');
  } catch (error) {
    console.error('[provision] JIT provisioning failed:', error);
    res.status(500).json({ error: 'Could not provision corporate profile.' });
  }
}

export default provision;
