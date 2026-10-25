import type { CorporateProfile, CorporateRole, EcosystemModuleId, ModuleAccess } from './types'

/**
 * Acesso do usuário a um banco do Ecossistema.
 * Sem a lista `modules` (servidor antigo), mantém o comportamento anterior: só Banco 1, com o cargo do perfil.
 */
export function getModuleAccess(profile: CorporateProfile | null | undefined, module: EcosystemModuleId): ModuleAccess | null {
  if (!profile) return null
  if (!Array.isArray(profile.modules)) return module === 'BANCO_1' ? { module, role: profile.role } : null
  return profile.modules.find((access) => access.module === module) ?? null
}

export function hasModuleAccess(profile: CorporateProfile | null | undefined, module: EcosystemModuleId): boolean {
  return getModuleAccess(profile, module) !== null
}

export function getModuleRole(profile: CorporateProfile | null | undefined, module: EcosystemModuleId): CorporateRole | null {
  return getModuleAccess(profile, module)?.role ?? null
}
