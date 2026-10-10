export type DemoRole = 'COLLABORATOR' | 'SUPERVISOR' | 'DIRECTOR_ADMIN'

export type CorporateRole = 'colaborador' | 'supervisor' | 'diretor'

export type CorporateProfile = {
  id: string
  email: string
  full_name: string
  role: CorporateRole
  squad_id: string | null
  active: boolean
  created_at?: string
  updated_at?: string
}

export type MicrosoftSessionInput = {
  id: string
  name: string
  email: string
  role: DemoRole
  corporateProfile?: CorporateProfile
}

export type DemoSession = {
  id: string
  name: string
  role: DemoRole
  createdAt: string
  explicitLoginAt: string
  isDemo: boolean
  version: 2
  email?: string
  authProvider?: 'demo' | 'microsoft'
  corporateProfile?: CorporateProfile
}
