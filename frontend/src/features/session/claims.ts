import type { DemoRole } from './types'

type MicrosoftClaims = {
  roles?: unknown
  groups?: unknown
}

function readClaimValues(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
}

function configuredValues(name: string) {
  return (import.meta.env[name] ?? '')
    .split(',')
    .map((value: string) => value.trim().toLowerCase())
    .filter(Boolean)
}

function includesConfiguredOrKeyword(values: string[], configured: string[], keywords: string[]) {
  return values.some((value) => {
    const normalized = value.toLowerCase()
    return configured.includes(normalized) || keywords.some((keyword) => normalized === keyword || normalized.includes(keyword))
  })
}

export function mapMicrosoftClaimsToRole(claims: MicrosoftClaims | null | undefined): DemoRole | null {
  const values = [...readClaimValues(claims?.roles), ...readClaimValues(claims?.groups)]
  if (includesConfiguredOrKeyword(values, configuredValues('VITE_MSAL_DIRECTOR_ROLES'), ['admin', 'diretor', 'director'])) {
    return 'DIRECTOR_ADMIN'
  }
  if (includesConfiguredOrKeyword(values, configuredValues('VITE_MSAL_SUPERVISOR_ROLES'), ['supervisor'])) {
    return 'SUPERVISOR'
  }
  return null
}
