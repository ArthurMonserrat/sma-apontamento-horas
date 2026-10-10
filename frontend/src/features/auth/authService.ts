import type { CorporateProfile, DemoRole } from '../session/types'

type ProvisionResponse = {
  profile?: CorporateProfile
  error?: string
}

/**
 * O navegador nunca acessa o Supabase diretamente. O BFF valida a sessão
 * Microsoft e executa o provisionamento usando a service role no servidor.
 */
export async function getCorporateProfile(email: string, fullName: string): Promise<CorporateProfile> {
  const response = await fetch('/api/provision', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, fullName }),
  })

  const payload = await response.json().catch(() => null) as ProvisionResponse | null
  if (!response.ok || !payload?.profile) {
    throw new Error(payload?.error ?? 'O perfil corporativo não foi retornado pelo servidor.')
  }

  return payload.profile
}

export function mapCorporateRole(role: CorporateProfile['role']): DemoRole {
  if (role === 'supervisor') return 'SUPERVISOR'
  if (role === 'diretor') return 'DIRECTOR_ADMIN'
  return 'COLLABORATOR'
}
