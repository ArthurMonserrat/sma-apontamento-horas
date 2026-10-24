export type DemoRole = 'COLLABORATOR' | 'SUPERVISOR' | 'DIRECTOR_ADMIN'

export type AuthProvider = 'demo' | 'supabase' | 'microsoft'

export type CorporateRole = 'colaborador' | 'supervisor' | 'diretor'

export type CorporateProfile = {
  id: string
  email: string
  full_name: string
  role: CorporateRole
  active: boolean
  created_at?: string
  updated_at?: string
}

export type MicrosoftSessionInput = {
  id: string
  name: string
  email: string
  role: DemoRole
  accessToken?: string
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
  authProvider?: AuthProvider
  corporateProfile?: CorporateProfile
}
