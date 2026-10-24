import type { CorporateProfile, DemoRole } from '../session/types'

type ProvisionResponse = {
  profile?: CorporateProfile
  error?: string
  /** Campos de diagnóstico do BFF /api/supabase-session. */
  requestId?: string
  stage?: string
  code?: string | null
  reason?: string
}

export type CorporateProfileErrorDiagnostics = {
  requestId?: string
  stage?: string
  code?: string | null
  reason?: string
}

export class CorporateProfileRequestError extends Error {
  readonly status: number
  readonly diagnostics: CorporateProfileErrorDiagnostics

  constructor(status: number, message: string, diagnostics: CorporateProfileErrorDiagnostics = {}) {
    super(message)
    this.name = 'CorporateProfileRequestError'
    this.status = status
    this.diagnostics = diagnostics
  }
}

export async function provisionMicrosoftProfile(email: string, fullName: string, accessToken: string): Promise<CorporateProfile> {
  const endpoint = '/api/provision'
  if (!accessToken.trim()) throw new Error('Token Microsoft ausente para provisionamento.')

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ email, fullName }),
    })
    const payload = await response.json().catch(() => null) as ProvisionResponse | null
    if (!response.ok || !payload?.profile) {
      console.error('[authService] Falha no provisionamento Microsoft:', {
        endpoint,
        status: response.status,
        statusText: response.statusText,
        error: payload?.error ?? 'Resposta sem perfil corporativo',
      })
      throw new Error(payload?.error ?? 'O perfil corporativo não foi retornado pelo servidor.')
    }
    return payload.profile
  } catch (error) {
    console.error('[authService] Erro ao sincronizar MSAL com o BFF:', {
      endpoint,
      email,
      error: error instanceof Error ? { name: error.name, message: error.message } : error,
    })
    throw error instanceof Error ? error : new Error('Falha desconhecida no provisionamento corporativo.')
  }
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
      const status = response.ok ? 502 : response.status
      const diagnostics: CorporateProfileErrorDiagnostics = {
        requestId: payload?.requestId ?? response.headers?.get?.('x-request-id') ?? undefined,
        stage: payload?.stage,
        code: payload?.code,
        reason: payload?.reason,
      }
      console.error('[authService] Falha ao carregar perfil corporativo:', {
        endpoint,
        status: response.status,
        statusText: response.statusText,
        error: payload?.error ?? 'Resposta sem perfil corporativo',
        ...diagnostics,
      })
      throw new CorporateProfileRequestError(
        status,
        payload?.error ?? 'O perfil corporativo não foi retornado pelo servidor.',
        diagnostics,
      )
    }

    return payload.profile
  } catch (error) {
    // Erro HTTP já foi registrado acima com requestId/stage; não duplicar o log.
    if (error instanceof CorporateProfileRequestError) throw error
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
