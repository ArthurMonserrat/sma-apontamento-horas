import localforage from 'localforage'
import type { CreateTimeEntryData } from '../../time-entries/types'

export const OFFLINE_QUEUE_STORE_NAME = 'sync_queue_horas'
export const OFFLINE_QUEUE_UPDATED_EVENT = 'sma:offline-queue-updated'

export type OfflineQueueItem = {
  id: string
  status: 'PENDING'
  collaboratorId: string
  data: CreateTimeEntryData
  queuedAt: string
}

const queueStore = localforage.createInstance({
  name: 'sma-banco-de-horas',
  storeName: OFFLINE_QUEUE_STORE_NAME,
})

function notifyQueueUpdated() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(OFFLINE_QUEUE_UPDATED_EVENT))
}

async function listPending(): Promise<OfflineQueueItem[]> {
  const items: OfflineQueueItem[] = []
  await queueStore.iterate<OfflineQueueItem, void>((item) => {
    if (item?.status === 'PENDING' && item.collaboratorId && item.data) items.push(item)
  })
  return items.sort((left, right) => left.queuedAt.localeCompare(right.queuedAt))
}

export const offlineQueueService = {
  async enqueue(item: Omit<OfflineQueueItem, 'queuedAt'>) {
    const queuedItem: OfflineQueueItem = { ...item, queuedAt: new Date().toISOString() }
    await queueStore.setItem(queuedItem.id, queuedItem)
    notifyQueueUpdated()
    return queuedItem
  },

  listPending,

  async countPending() {
    return (await listPending()).length
  },

  async remove(id: string) {
    await queueStore.removeItem(id)
    notifyQueueUpdated()
  },

  async clear() {
    await queueStore.clear()
    notifyQueueUpdated()
  },
}
