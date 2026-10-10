import { useOfflineSync } from '../offlineSyncContext'

export function OfflineStatusIndicator() {
  const { isOnline, pendingCount } = useOfflineSync()
  if (isOnline && pendingCount === 0) return null

  return (
    <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-muted)]" role="status" aria-live="polite">
      {!isOnline && <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300"><span aria-hidden="true">●</span> Modo Offline</span>}
      {pendingCount > 0 && <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-2 py-1" aria-label={`${pendingCount} apontamentos aguardando sincronização`}>{pendingCount} pendente{pendingCount === 1 ? '' : 's'}</span>}
    </div>
  )
}
