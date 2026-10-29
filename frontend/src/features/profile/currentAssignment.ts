import type { AssignmentSnapshot } from '../squads/types'
import { isCorporateDataActive } from '../corporate/corporateData'
import { resolveCorporateAssignment } from '../time-entries/infrastructure/supabaseTimeEntryService'
import { profileService } from './infrastructure/profileService'

/**
 * Equipe e supervisor da pessoa.
 * Login Microsoft: supervisão do banco de dados (definida pela diretoria em Equipes).
 * Demonstração: squad do perfil local.
 */
export async function resolveCurrentAssignment(collaboratorId: string): Promise<AssignmentSnapshot | null> {
  if (isCorporateDataActive()) return resolveCorporateAssignment(collaboratorId)
  return profileService.resolveAssignment(collaboratorId)
}
