export type DemoRole = 'COLLABORATOR' | 'SUPERVISOR' | 'DIRECTOR_ADMIN'

export type MicrosoftSessionInput = {
  id: string
  name: string
  email: string
  role: DemoRole
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
}
