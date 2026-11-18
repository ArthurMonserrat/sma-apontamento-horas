export type AuditEventType =
  | 'TIME_ENTRY_CREATED'
  | 'TIME_ENTRY_EDITED'
  | 'TIME_ENTRY_DUPLICATED'
  | 'TIME_ENTRY_CANCELLED'
  | 'DAY_APPROVED'
  | 'DAY_APPROVED_WITH_DEFICIT'
  | 'CORRECTION_REQUESTED'
  | 'CORRECTION_COMPLETED'
  | 'DAY_REOPENED'
  | 'COMPETENCY_REOPENED'
  | 'SQUAD_CHANGED'
  | 'VACATION_RECORDED'
  | 'MEDICAL_LEAVE_RECORDED'

export interface AuditEvent {
  id: string
  type: AuditEventType
  occurredAt: string
  actorId: string
  actorRole: 'COLLABORATOR' | 'SUPERVISOR' | 'SYSTEM'
  entityType: string
  entityId: string
  relatedEntityId?: string
  previousValue?: unknown
  newValue?: unknown
  justification?: string
  metadata?: Record<string, string | number | boolean | null>
}
