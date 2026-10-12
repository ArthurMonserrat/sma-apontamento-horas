import type { CorporateProfile, DemoRole } from '../session/types'

type ProvisionResponse = {
  profile?: CorporateProfile
  error?: string
}

/** O navegador envia somente o bearer Supabase; cargos nunca vêm do cliente. */
export async function getCorporateProfile(accessToken: string): Promise<CorporateProfile> {
  if (!accessToken.trim()) throw new Error('Sessão Supabase ausente.')

  const response = await fetch('/api/supabase-session', {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  const payload = await response.json().catch(() => null) as ProvisionResponse | null
  if (!response.ok || !payload?.profile) {
    throw new Error(payload?.error ?? 'O perfil corporativo não foi retornado pelo servidor.')
  }

  return payload.profile
}

export function mapCorporateRole(role: unknown): DemoRole | null {
  if (role === 'supervisor') return 'SUPERVISOR'
  if (role === 'diretor') return 'DIRECTOR_ADMIN'
  if (role === 'colaborador') return 'COLLABORATOR'
  return null
}
