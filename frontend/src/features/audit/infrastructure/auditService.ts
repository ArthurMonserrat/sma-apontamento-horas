import type { AuditEvent } from '../types'
import { createBrowserStorage, type StorageLike } from '../../../shared/infrastructure/storage/browserStorage'

const AUDIT_STORAGE_KEY = 'sma:audit-events:v1'

export interface AuditService {
  record(event: AuditEvent): Promise<void>
  listByEntity(entityType: string, entityId: string): Promise<AuditEvent[]>
}

export class LocalAuditService implements AuditService {
  private readonly storage: StorageLike

  constructor(storage: StorageLike) {
    this.storage = storage
  }

  private read() {
    try {
      const raw = this.storage.getItem(AUDIT_STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw) as unknown
      return Array.isArray(parsed) ? parsed.filter((event): event is AuditEvent => {
        if (!event || typeof event !== 'object') return false
        const candidate = event as Partial<AuditEvent>
        return typeof candidate.id === 'string'
          && typeof candidate.type === 'string'
          && typeof candidate.occurredAt === 'string'
          && typeof candidate.entityType === 'string'
          && typeof candidate.entityId === 'string'
      }) : []
    } catch (error) {
      console.error('Não foi possível ler a auditoria local.', error)
      return []
    }
  }

  async record(event: AuditEvent) {
    this.storage.setItem(AUDIT_STORAGE_KEY, JSON.stringify([...this.read(), event]))
  }

  async listByEntity(entityType: string, entityId: string) {
    return this.read().filter((event) => event.entityType === entityType && event.entityId === entityId)
  }
}

export const auditService = new LocalAuditService(createBrowserStorage())
