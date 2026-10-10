import type { DemoRole, MicrosoftSessionInput } from '../../features/session/types'

export type EcosystemModule = 'BANCO_1' | 'BANCO_2'

export function getEcosystemModulePath(module: EcosystemModule) {
  return module === 'BANCO_1'
    ? '/selecao-perfil?modulo=banco1'
    : '/selecao-perfil?modulo=banco2'
}

export function toMicrosoftSessionInput(account: { homeAccountId: string; name?: string; username: string }, role: DemoRole = 'COLLABORATOR'): MicrosoftSessionInput {
  return {
    id: account.homeAccountId,
    name: account.name || account.username,
    email: account.username,
    role,
  }
}
