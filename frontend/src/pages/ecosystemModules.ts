export type EcosystemModule = 'BANCO_1' | 'BANCO_2'

export function getEcosystemModulePath(module: EcosystemModule) {
  return module === 'BANCO_1'
    ? '/selecao-perfil?modulo=banco1'
    : '/selecao-perfil?modulo=banco2'
}
