export interface SupabaseBrowserConfig {
  url: string
  anonKey: string
  redirectTo: string
  enabled: boolean
}

type PublicEnv = Record<string, string | undefined>

function getCurrentOrigin(): string {
  return typeof globalThis.location?.origin === 'string' ? globalThis.location.origin : ''
}

function readAllowedRedirects(env: PublicEnv): string[] {
  return (env.VITE_SUPABASE_ALLOWED_REDIRECTS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

export function getSupabaseBrowserConfig(env: PublicEnv = import.meta.env, origin = getCurrentOrigin()): SupabaseBrowserConfig {
  const url = env.VITE_SUPABASE_URL?.trim() ?? ''
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''
  const redirectCandidate = origin ? `${origin.replace(/\/$/, '')}/auth/callback` : ''
  const allowedRedirects = readAllowedRedirects(env)
  const redirectTo = allowedRedirects.includes(redirectCandidate) ? redirectCandidate : ''

  return {
    url,
    anonKey,
    redirectTo,
    enabled: Boolean(url && anonKey && redirectTo),
  }
}
