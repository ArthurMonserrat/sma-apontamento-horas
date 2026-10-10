import type { AssignmentSnapshot, Squad, Supervisor } from '../../features/squads/types'
import type { WorkloadVersion } from '../../features/workloads/types'
import type { CollaboratorProfile, WorkLocation } from '../../features/profile/types'
import type { Activity, Client } from '../../shared/types/domain'

const weekdayMinutes = 480

export const demoCollaborator: CollaboratorProfile = {
  id: 'demo-collaborator-001',
  name: 'Colaborador',
  email: 'colaborador.demo@sma.local',
  jobTitle: 'Projetista',
  active: true,
  activeSquadId: 'squad-automation',
  location: {
    countryCode: 'BR', stateCode: 'SP', city: 'São Paulo', timeZone: 'America/Sao_Paulo',
  },
}

export const demoClients: Client[] = [
  { id: 'client-industrial-alpha', name: 'Cliente Industrial Alfa', active: true },
  { id: 'client-energy-beta', name: 'Cliente Energia Beta', active: true },
]

export const demoActivities: Activity[] = [
  { id: 'activity-document-analysis', name: 'Análise de documento', active: true },
  { id: 'activity-collaborator-support', name: 'Apoio a colaborador', active: true },
  { id: 'activity-proposal-support', name: 'Apoio propostas', active: true },
  { id: 'activity-project-follow-up', name: 'Apontamento de projeto — acompanhamento', active: true },
  { id: 'activity-aso-mobilization', name: 'ASO — mobilização', active: true },
  { id: 'activity-client-comments', name: 'Atendimento de comentários do cliente', active: true },
  { id: 'activity-internal-comments', name: 'Atendimento de comentários internos', active: true },
  { id: 'activity-project-design', name: 'Elaboração de projeto', active: true },
  { id: 'activity-document-issue', name: 'Emissão de documento', active: true },
  { id: 'activity-management-schedule', name: 'Gerenciamento e cronograma', active: true },
  { id: 'activity-field-survey', name: 'Levantamento de campo', active: true },
  { id: 'activity-start-data-survey', name: 'Levantamento de dados para início de atividade', active: true },
  { id: 'activity-3d-model', name: 'Modelo 3D', active: true },
  { id: 'activity-idleness', name: 'Ociosidade', active: true },
  { id: 'activity-it-idleness', name: 'Ociosidade por TI', active: true },
  { id: 'activity-client-meeting', name: 'Reunião com cliente', active: true },
  { id: 'activity-internal-meeting', name: 'Reunião interna', active: true },
  { id: 'activity-training', name: 'Treinamentos', active: true },
  { id: 'activity-document-verification', name: 'Verificação de documento', active: true },
  { id: 'activity-other', name: 'Outros', active: true },
]

export const demoSupervisors: Supervisor[] = [
  { id: 'supervisor-demo-001', name: 'Jeen Carlos E. Azevedo', email: 'supervisao.demo@sma.local', active: true },
]

export const demoSquads: Squad[] = [
  { id: 'squad-automation', name: 'Engenharia de Automação', supervisorId: 'supervisor-demo-001', active: true },
  { id: 'squad-electrical', name: 'Engenharia Elétrica', supervisorId: 'supervisor-demo-001', active: true },
]

export const demoAssignmentSnapshot: AssignmentSnapshot = {
  squadId: 'squad-automation',
  squadName: 'Engenharia de Automação',
  supervisorId: 'supervisor-demo-001',
  supervisorName: 'Jeen Carlos E. Azevedo',
}

export const demoWorkloadVersions: WorkloadVersion[] = [{
  id: 'workload-demo-001',
  collaboratorId: demoCollaborator.id,
  dailyMinutes: weekdayMinutes,
  effectiveFrom: '2026-07-01',
  status: 'APPROVED',
  createdAt: '2020-01-01T12:00:00.000Z',
  approvedAt: '2020-01-01T12:00:00.000Z',
}]

export const demoWorkLocation: WorkLocation = {
  countryCode: 'BR',
  stateCode: 'SP',
  city: 'São Paulo',
  timeZone: 'America/Sao_Paulo',
}
