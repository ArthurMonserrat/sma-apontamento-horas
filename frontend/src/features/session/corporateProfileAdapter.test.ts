import { describe, expect, it } from 'vitest'
import { toCollaboratorProfile } from './corporateProfileAdapter'
import type { CorporateProfile } from './types'

const completeProfile: CorporateProfile = {
  id: 'profile-1',
  email: 'ana@example.invalid',
  full_name: 'Ana Silva',
  role: 'colaborador',
  squad_id: 'squad-1',
  active: true,
  job_title: 'Analista',
  location: { countryCode: 'BR', stateCode: 'SP', city: 'São Paulo', timeZone: 'America/Sao_Paulo' },
}

describe('adapter de perfil corporativo', () => {
  it('converte somente o contrato administrativo completo', () => {
    expect(toCollaboratorProfile(completeProfile)).toEqual({
      id: 'profile-1',
      name: 'Ana Silva',
      email: 'ana@example.invalid',
      jobTitle: 'Analista',
      active: true,
      location: completeProfile.location,
      activeSquadId: 'squad-1',
    })
  })

  it('não inventa cargo, localização ou squad ausentes', () => {
    expect(toCollaboratorProfile({ ...completeProfile, job_title: null })).toBeNull()
    expect(toCollaboratorProfile({ ...completeProfile, location: null })).toBeNull()
    expect(toCollaboratorProfile({ ...completeProfile, squad_id: null })).toBeNull()
  })

  it('recusa perfil inativo ou campos textuais vazios', () => {
    expect(toCollaboratorProfile({ ...completeProfile, active: false })).toBeNull()
    expect(toCollaboratorProfile({ ...completeProfile, full_name: ' ' })).toBeNull()
    expect(toCollaboratorProfile({ ...completeProfile, email: ' ' })).toBeNull()
  })
})
