import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import { timeEntryService } from '../time-entries'
import { OFFLINE_QUEUE_UPDATED_EVENT, offlineQueueService } from './infrastructure/offlineQueueService'
import { OfflineSyncContext } from './offlineSyncContext'

export function OfflineSyncProvider({ children }: PropsWithChildren) {
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)
  const processingRef = useRef(false)

  const refreshCount = useCallback(async () => {
    try {
      setPendingCount(await offlineQueueService.countPending())
    } catch (error) {
      console.error('Não foi possível consultar a fila offline.', error)
    }
  }, [])

  const syncNow = useCallback(async () => {
    if (processingRef.current || (typeof navigator !== 'undefined' && !navigator.onLine)) return
    processingRef.current = true
    try {
      const pendingItems = await offlineQueueService.listPending()
      for (const item of pendingItems) {
        try {
          await timeEntryService.create(item.collaboratorId, item.data)
          await offlineQueueService.remove(item.id)
        } catch (error) {
          console.error('Não foi possível sincronizar o apontamento offline.', error)
          break
        }
      }
    } catch (error) {
      console.error('Não foi possível processar a fila offline.', error)
    } finally {
      processingRef.current = false
      await refreshCount()
    }
  }, [refreshCount])

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      void syncNow()
    }
    const handleOffline = () => setIsOnline(false)
    const handleQueueUpdated = () => void refreshCount()

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener(OFFLINE_QUEUE_UPDATED_EVENT, handleQueueUpdated)
    void refreshCount()
    if (navigator.onLine) void syncNow()

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener(OFFLINE_QUEUE_UPDATED_EVENT, handleQueueUpdated)
    }
  }, [refreshCount, syncNow])

  const value = useMemo(() => ({ isOnline, pendingCount, syncNow }), [isOnline, pendingCount, syncNow])
  return <OfflineSyncContext.Provider value={value}>{children}</OfflineSyncContext.Provider>
}
