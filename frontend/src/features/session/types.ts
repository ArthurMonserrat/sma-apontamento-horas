export type DemoRole = 'COLLABORATOR' | 'SUPERVISOR' | 'DIRECTOR_ADMIN'

export type AuthProvider = 'demo' | 'supabase' | 'microsoft'

export type CorporateRole = 'colaborador' | 'supervisor' | 'diretor'

export type EcosystemModuleId = 'BANCO_1' | 'BANCO_2'

/** Acesso liberado a um banco; role já resolvido (cargo do banco ou, se vazio, o cargo do perfil). */
export type ModuleAccess = {
  module: EcosystemModuleId
  role: CorporateRole
}

export type CorporateProfile = {
  id: string
  email: string
  full_name: string
  role: CorporateRole
  active: boolean
  /** Bancos liberados para o usuário. Ausente = resposta antiga do servidor (somente Banco 1). */
  modules?: ModuleAccess[]
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
