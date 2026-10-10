import type { StatusTone } from '../../shared/ui/StatusBadge'
import type { DayApprovalStatus } from '../approvals/types'
import type { TimeEntryStatus } from '../time-entries/types'
import type { TimeOffRequestStatus } from '../time-off/types'
import type { WorkloadChangeRequestStatus } from '../workloads/types'

type StatusPresentation = Readonly<{
  label: string
  tone: StatusTone
}>

export const approvalStatusPresentation = {
  IN_PROGRESS: { label: 'Em andamento', tone: 'info' },
  AVAILABLE_FOR_APPROVAL: { label: 'Disponível para aprovação', tone: 'pending' },
  CORRECTION_REQUESTED: { label: 'Correção solicitada', tone: 'warning' },
  APPROVED: { label: 'Aprovado', tone: 'success' },
  REOPENED: { label: 'Reaberto', tone: 'info' },
  NO_SUBMISSION: { label: 'Sem apontamento enviado', tone: 'neutral' },
} as const satisfies Readonly<Record<DayApprovalStatus, StatusPresentation>>

export const nonApplicableApprovalPresentation = {
  label: 'Aprovação não aplicável',
  tone: 'neutral',
} as const satisfies StatusPresentation

export const workloadRequestStatusPresentation = {
  PENDING: { label: 'Pendente', tone: 'pending' },
  APPROVED: { label: 'Aprovada', tone: 'success' },
  REJECTED: { label: 'Rejeitada', tone: 'danger' },
  CANCELLED: { label: 'Cancelada', tone: 'cancelled' },
} as const satisfies Readonly<Record<WorkloadChangeRequestStatus, StatusPresentation>>

export const timeOffStatusPresentation = {
  PENDING: { label: 'Pendente de aprovação', tone: 'pending' },
  APPROVED: { label: 'Aprovada', tone: 'success' },
  REJECTED: { label: 'Rejeitada', tone: 'danger' },
  CANCELLED: { label: 'Cancelada', tone: 'cancelled' },
} as const satisfies Readonly<Record<TimeOffRequestStatus, StatusPresentation>>

export const timeEntryStatusPresentation = {
  PENDING: { label: 'Pendente de aprovação', tone: 'pending' },
  APPROVED: { label: 'Aprovado', tone: 'success' },
  REJECTED: { label: 'Rejeitado', tone: 'danger' },
  ACTIVE: { label: 'Ativo', tone: 'neutral' },
  CANCELLED: { label: 'Cancelado', tone: 'cancelled' },
} as const satisfies Readonly<Record<TimeEntryStatus, StatusPresentation>>

export const revisionStatusPresentation = {
  label: 'Editado',
  tone: 'info',
} as const satisfies StatusPresentation
