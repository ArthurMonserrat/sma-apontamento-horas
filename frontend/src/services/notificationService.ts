import type { SupervisorNotification } from '../features/audit/types'
import { createBrowserStorage, type StorageLike } from '../shared/infrastructure/storage/browserStorage'

const NOTIFICATION_STORAGE_KEY = 'sma:supervisor-notifications:v1'

export interface NotificationService {
  record(notification: SupervisorNotification): Promise<void>
  listForSupervisor(supervisorId: string): Promise<SupervisorNotification[]>
}

export class LocalNotificationService implements NotificationService {
  private readonly storage: StorageLike

  constructor(storage: StorageLike) {
    this.storage = storage
  }

  private read() {
    try {
      const raw = this.storage.getItem(NOTIFICATION_STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw) as unknown
      return Array.isArray(parsed) ? parsed.filter((item): item is SupervisorNotification => {
        if (!item || typeof item !== 'object') return false
        const notification = item as Partial<SupervisorNotification>
        return typeof notification.id === 'string'
          && typeof notification.supervisorId === 'string'
          && typeof notification.type === 'string'
          && typeof notification.relatedEntityId === 'string'
          && typeof notification.createdAt === 'string'
      }) : []
    } catch (error) {
      console.error('Não foi possível ler as notificações locais.', error)
      return []
    }
  }

  async record(notification: SupervisorNotification) {
    this.storage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify([...this.read(), notification]))
  }

  async listForSupervisor(supervisorId: string) {
    return this.read().filter((notification) => notification.supervisorId === supervisorId)
  }
}

export const notificationService = new LocalNotificationService(createBrowserStorage())
