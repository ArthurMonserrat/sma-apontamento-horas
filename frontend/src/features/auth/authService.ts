import type { CorporateProfile, DemoRole } from '../session/types'

type ProvisionResponse = {
  profile?: CorporateProfile
  error?: string
}

/** O navegador envia somente o bearer Supabase; cargos nunca vêm do cliente. */
export async function getCorporateProfile(accessToken: string): Promise<CorporateProfile> {
  const endpoint = '/api/supabase-session'
  if (!accessToken.trim()) {
    console.error('[authService] Token de sessão vazio antes da consulta corporativa.', { endpoint })
    throw new Error('Sessão Supabase ausente.')
  }

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    const payload = await response.json().catch(() => null) as ProvisionResponse | null
    if (!response.ok || !payload?.profile) {
      console.error('[authService] Falha ao carregar perfil corporativo:', {
        endpoint,
        status: response.status,
        statusText: response.statusText,
        error: payload?.error ?? 'Resposta sem perfil corporativo',
      })
      throw new Error(payload?.error ?? 'O perfil corporativo não foi retornado pelo servidor.')
    }

    return payload.profile
  } catch (error) {
    console.error('[authService] Erro de rede ou resposta inválida:', {
      endpoint,
      error: error instanceof Error ? { name: error.name, message: error.message } : error,
    })
    throw error instanceof Error ? error : new Error('Falha desconhecida ao carregar o perfil corporativo.')
  }
}

export function mapCorporateRole(role: unknown): DemoRole | null {
  if (role === 'supervisor') return 'SUPERVISOR'
  if (role === 'diretor') return 'DIRECTOR_ADMIN'
  if (role === 'colaborador') return 'COLLABORATOR'
  return null
}
