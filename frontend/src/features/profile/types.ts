export interface WorkLocation {
  countryCode: 'BR'
  stateCode: string
  city: string
  timeZone: string
}

export interface CollaboratorProfile {
  id: string
  name: string
  email: string
  jobTitle: string
  active: boolean
  location: WorkLocation
  activeSquadId: string
  assinaturaBase64?: string
}
