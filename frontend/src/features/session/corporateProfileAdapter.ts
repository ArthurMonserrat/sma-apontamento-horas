import type { CollaboratorProfile } from '../profile/types'
import type { CorporateProfile } from './types'

function nonBlank(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Converts only server-supplied corporate data into the shape expected by
 * collaborator screens. Missing administrative fields are a hard stop: no
 * demo defaults, guessed location, or role-derived job title are allowed.
 */
export function toCollaboratorProfile(input: CorporateProfile | null | undefined): CollaboratorProfile | null {
  if (!input?.active || !nonBlank(input.id) || !nonBlank(input.full_name) || !nonBlank(input.email) || !nonBlank(input.job_title) || !nonBlank(input.squad_id)) {
    return null
  }

  const location = input.location
  if (!location || !nonBlank(location.stateCode) || !nonBlank(location.city) || !nonBlank(location.timeZone)) return null

  return {
    id: input.id,
    name: input.full_name,
    email: input.email,
    jobTitle: input.job_title,
    active: input.active,
    location,
    activeSquadId: input.squad_id,
  }
}
