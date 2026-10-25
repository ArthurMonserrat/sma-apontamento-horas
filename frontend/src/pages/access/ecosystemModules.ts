export const OAUTH_DESTINATION_KEY = 'sma:oauth-destination'

export type EcosystemModule = 'BANCO_1' | 'BANCO_2'

const MODULE_PATHS: Record<EcosystemModule, string> = {
  BANCO_1: '/?modulo=banco1',
  BANCO_2: '/?modulo=banco2',
}

/** Rota de retorno do OAuth para cada banco (sempre interna ao Ecossistema). */
export function getEcosystemModulePath(module: EcosystemModule) {
  return MODULE_PATHS[module]
}

export function isAllowedOAuthDestination(destination: string | null): destination is string {
  return destination === MODULE_PATHS.BANCO_1 || destination === MODULE_PATHS.BANCO_2
}

/**
 * Endereço do site do Banco 2 (site separado). Só aceita https (ou http em localhost).
 * Sem variável configurada, o Banco 2 aparece como indisponível.
 */
export function getBanco2Url(rawValue: string | undefined = import.meta.env.VITE_BANCO_2_URL): string | null {
  const value = rawValue?.trim()
  if (!value) return null
  try {
    const url = new URL(value)
    const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    if (url.protocol !== 'https:' && !(isLocal && url.protocol === 'http:')) return null
    return url.toString()
  } catch {
    return null
  }
}
