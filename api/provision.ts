import { createClient } from '@supabase/supabase-js';
import { parse } from 'cookie';
import type { VercelRequest, VercelResponse } from '../server/types.js';

const DIRETOR_EMAILS = [
  'fernando.almeida@sma-eng.com.br',
  'email.diretor2@sma-eng.com.br',
];

const SUPERVISOR_EMAILS = [
  'supervisor1@sma-eng.com.br',
  'supervisor2@sma-eng.com.br',
];

type ProfileRole = 'colaborador' | 'supervisor' | 'diretor';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function roleForEmail(email: string): ProfileRole {
  const normalizedEmail = normalizeEmail(email);
  if (DIRETOR_EMAILS.includes(normalizedEmail)) return 'diretor';
  if (SUPERVISOR_EMAILS.includes(normalizedEmail)) return 'supervisor';
  return 'colaborador';
}

function getSessionToken(req: VercelRequest): string | null {
  const authorization = req.headers?.authorization;
  const rawAuthorization = Array.isArray(authorization) ? authorization[0] : authorization;
  if (rawAuthorization?.startsWith('Bearer ')) return rawAuthorization.slice('Bearer '.length).trim() || null;

  const cookieHeader = req.headers?.cookie;
  const rawCookie = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
  if (rawCookie) return parse(rawCookie).sma_session ?? null;
  return req.cookies?.sma_session ?? null;
}

async function getAuthenticatedMicrosoftUser(req: VercelRequest) {
  const accessToken = getSessionToken(req);
  if (!accessToken) {
    console.error('[provision] Sessão Microsoft ausente: cookie sma_session não encontrado.');
    return null;
  }

  const graphEndpoint = 'https://graph.microsoft.com/v1.0/me?$select=displayName,userPrincipalName,mail';
  const response = await fetch(graphEndpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    console.error('[provision] Microsoft Graph rejeitou a sessão:', {
      endpoint: graphEndpoint,
      status: response.status,
      statusText: response.statusText,
    });
    return null;
  }

  const account = await response.json() as { displayName?: string; userPrincipalName?: string; mail?: string | null };
  const authenticatedEmail = account.userPrincipalName ?? account.mail;
  if (!isNonEmptyString(authenticatedEmail) || !isNonEmptyString(account.displayName)) return null;
  return { email: normalizeEmail(authenticatedEmail), fullName: account.displayName.trim() };
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    console.error('[provision] Variáveis Supabase ausentes na Vercel:', {
      hasSupabaseUrl: Boolean(url),
      hasServiceRoleKey: Boolean(serviceRoleKey),
    });
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured on the server.');
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function findByEmail(supabase: ReturnType<typeof getSupabaseAdmin>, email: string) {
  return supabase.from('profiles').select('*').eq('email', email).maybeSingle();
}

async function insertProfile(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  user: { email: string; fullName: string },
) {
  return supabase
    .from('profiles')
    .insert({
      email: user.email,
      full_name: user.fullName,
      role: roleForEmail(user.email),
      active: true,
    })
    .select('*')
    .single();
}

function isKnownRole(value: unknown): value is 'colaborador' | 'supervisor' | 'diretor' {
  return value === 'colaborador' || value === 'supervisor' || value === 'diretor';
}

export async function provision(req: VercelRequest, res: VercelResponse): Promise<void> {
  console.info('[provision] Requisição recebida:', {
    method: req.method,
    hasSessionCredential: Boolean(req.headers?.authorization || req.headers?.cookie || req.cookies?.sma_session),
  });
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
    if (existing.error) {
      console.error('[provision] Falha ao consultar profiles no Supabase:', {
        code: existing.error.code,
        message: existing.error.message,
        details: existing.error.details,
        hint: existing.error.hint,
      });
      throw existing.error;
    }
    let profile = existing.data;

    if (!profile) {
      const created = await insertProfile(supabase, authenticatedUser);
      if (created.error) {
        // Two first logins may race. If another request inserted the profile,
        // return that row instead of exposing a transient 500 to the user.
        if (created.error.code === '23505') {
          const concurrentProfile = await findByEmail(supabase, authenticatedUser.email);
          if (concurrentProfile.error || !concurrentProfile.data) throw created.error;
          profile = concurrentProfile.data;
        } else {
          console.error('[provision] Falha ao criar perfil no Supabase:', {
            code: created.error.code,
            message: created.error.message,
            details: created.error.details,
            hint: created.error.hint,
          });
          throw created.error;
        }
      } else {
        profile = created.data;
      }
    }

    if (!profile || profile.active !== true) {
      res.status(403).json({ error: 'Corporate profile is inactive.' });
      return;
    }
    if (!isKnownRole(profile.role)) {
      res.status(403).json({ error: 'Corporate profile has an invalid role.' });
      return;
    }
    if (!isNonEmptyString(profile.id) || !isNonEmptyString(profile.email)) {
      res.status(403).json({ error: 'Corporate profile is incomplete.' });
      return;
    }
    res.status(200).json({ profile });
  } catch (error) {
    console.error('[provision] Corporate profile lookup failed:', {
      error: error instanceof Error ? { name: error.name, message: error.message } : error,
    });
    res.status(500).json({ error: 'Could not validate corporate profile.' });
  }
}

export default provision;
