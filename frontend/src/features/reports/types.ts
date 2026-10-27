export type ReportStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ACTIVE' | 'CANCELLED'

export interface ReportEntry {
  id: string
  collaboratorId: string
  entryDate: string
  projectCode: string
  durationMinutes: number
  extraMinutes: number
  nightMinutes: number
  status: ReportStatus
  details?: string
  activityName?: string
  supervisorName?: string
  squadName?: string
  collaboratorName?: string
  collaboratorJobTitle?: string
}

export interface ReportCollaborator {
  id: string
  name: string
  jobTitle?: string
  workedMinutes: number
  extraMinutes: number
  nightMinutes: number
  bankMinutes: number
  entries: ReportEntry[]
}

export interface ReportSupervisor {
  id: string
  name: string
  workedMinutes: number
  extraMinutes: number
  nightMinutes: number
  bankMinutes: number
  collaborators: ReportCollaborator[]
}
