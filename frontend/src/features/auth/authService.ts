import type { CorporateProfile, DemoRole } from '../session/types'

type ProvisionResponse = {
  profile?: CorporateProfile
  error?: string
}

/**
 * O navegador nunca acessa o Supabase diretamente. O BFF valida a sessão
 * Microsoft e somente retorna um perfil corporativo já autorizado no servidor.
 */
export async function getCorporateProfile(): Promise<CorporateProfile> {
  const response = await fetch('/api/provision', {
    method: 'POST',
    credentials: 'include',
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
