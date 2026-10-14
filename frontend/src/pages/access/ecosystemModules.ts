export const OAUTH_DESTINATION_KEY = 'sma:oauth-destination'

export type EcosystemModule = 'BANCO_1' | 'BANCO_2'

export function getEcosystemModulePath(module: EcosystemModule) {
  return module === 'BANCO_1' ? '/?modulo=banco1' : null
}

export function isAllowedOAuthDestination(destination: string | null): destination is string {
  return destination === getEcosystemModulePath('BANCO_1')
}
