import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../session/useSession'
import { isCorporateDataActive } from '../../corporate/corporateData'
import { ANNOUNCEMENTS_UPDATED_EVENT, isAnnouncementHiddenForUser, isVisibleToCollaborator } from '../infrastructure/announcementService'
import { getAnnouncementRepository, setDemoAnnouncementUser, type AnnouncementRepository } from '../infrastructure/announcementRepository'
import type { Comunicado } from '../types'
import { NavigationIcon } from '../../../shared/ui/NavigationIcon'
import { AnnouncementNotificationsContext, announcementsPathForRole, type BrowserNotificationState } from './announcementNotificationsContext'

const POLL_INTERVAL_MS = 60_000
const TOAST_DURATION_MS = 10_000


function browserNotificationState(): BrowserNotificationState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return window.Notification.permission as BrowserNotificationState
}

/** Balão do sistema operacional (celular/computador) quando o navegador permite. */
async function showBrowserNotification(title: string, body: string) {
  if (browserNotificationState() !== 'granted') return
  const icon = `${import.meta.env.BASE_URL}sma-logo-192.png`
  const options = { body, icon, badge: icon, tag: 'sma-avisos' }
  try {
    const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
    if (registration) {
      await registration.showNotification(title, options)
      return
    }
    new window.Notification(title, options)
  } catch {
    // Alguns navegadores bloqueiam notificações fora de um service worker: fica só o balão do app.
  }
}

type Toast = { key: number; title: string; body: string; urgent: boolean }

type ProviderProps = {
  children: ReactNode
  /** Injetável em testes. */
  repository?: AnnouncementRepository
  pollIntervalMs?: number
}

/**
 * Contador de avisos não lidos, balão no app e notificação do navegador.
 * Consulta os avisos a cada minuto, ao voltar para a aba e quando um aviso é publicado.
 */
export function AnnouncementNotificationsProvider({ children, repository: injectedRepository, pollIntervalMs = POLL_INTERVAL_MS }: ProviderProps) {
  const { session, profile } = useSession()
  const navigate = useNavigate()
  const [announcements, setAnnouncements] = useState<Comunicado[]>([])
  const [toast, setToast] = useState<Toast | null>(null)
  const [permission, setPermission] = useState<BrowserNotificationState>(browserNotificationState)
  const knownUnreadRef = useRef<Set<string> | null>(null)
  const userId = session?.id ?? null
  const corporate = isCorporateDataActive()

  useEffect(() => {
    if (!corporate) setDemoAnnouncementUser(userId)
  }, [corporate, userId])

  const repository = useMemo(() => injectedRepository ?? getAnnouncementRepository(corporate), [corporate, injectedRepository])

  const unread = useMemo(() => announcements.filter((item) => (
    !item.lido
    && !isAnnouncementHiddenForUser(item, userId ?? undefined)
    && (corporate || session?.role !== 'COLLABORATOR' || isVisibleToCollaborator(item, profile?.id, profile?.email, profile?.activeSquadId))
  )), [announcements, corporate, profile?.activeSquadId, profile?.email, profile?.id, session?.role, userId])

  const refresh = useCallback(async () => {
    if (!userId) {
      setAnnouncements([])
      return
    }
    try {
      setAnnouncements(await repository.list())
    } catch {
      // Sem conexão: mantém o último contador conhecido.
    }
  }, [repository, userId])

  // Novo aviso desde a última consulta: balão no app e, com permissão, do navegador.
  useEffect(() => {
    const ids = new Set(unread.map((item) => item.id))
    const known = knownUnreadRef.current
    knownUnreadRef.current = ids
    if (!userId) return
    const fresh = known === null ? unread : unread.filter((item) => !known.has(item.id))
    if (fresh.length === 0) return
    const newest = fresh[0]
    const firstLoad = known === null
    const title = fresh.length === 1
      ? `${firstLoad ? 'Aviso não lido' : 'Novo aviso'}: ${newest.titulo}`
      : `Você tem ${fresh.length} avisos ${firstLoad ? 'não lidos' : 'novos'}`
    const body = fresh.length === 1 ? newest.mensagem.slice(0, 140) : fresh.slice(0, 3).map((item) => item.titulo).join(' · ')
    setToast({ key: Date.now(), title, body, urgent: fresh.some((item) => item.urgencia === 'urgente') })
    if (known !== null) void showBrowserNotification(title, body)
  }, [unread, userId])

  useEffect(() => {
    knownUnreadRef.current = null
    setToast(null)
    void refresh()
    if (!userId) return
    const interval = window.setInterval(() => { void refresh() }, pollIntervalMs)
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    const onChanged = () => { void refresh() }
    window.addEventListener('focus', onChanged)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener(ANNOUNCEMENTS_UPDATED_EVENT, onChanged)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', onChanged)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener(ANNOUNCEMENTS_UPDATED_EVENT, onChanged)
    }
  }, [pollIntervalMs, refresh, userId])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), TOAST_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [toast])

  const markAllRead = useCallback(async (ids?: string[]) => {
    if (!userId) return
    const targets = ids ?? unread.map((item) => item.id)
    if (targets.length === 0) return
    const targetSet = new Set(targets)
    setAnnouncements((current) => current.map((item) => targetSet.has(item.id) ? { ...item, lido: true } : item))
    try {
      await repository.markRead(targets, userId)
    } catch {
      // Se falhar, a próxima consulta mostra o contador de novo.
    }
  }, [repository, unread, userId])

  const enableBrowserNotifications = useCallback(async () => {
    if (browserNotificationState() === 'unsupported') return
    try {
      setPermission(await window.Notification.requestPermission() as BrowserNotificationState)
    } catch {
      setPermission(browserNotificationState())
    }
  }, [])

  const value = useMemo(() => ({
    unreadCount: unread.length,
    unread,
    markAllRead,
    refresh,
    browserNotifications: permission,
    enableBrowserNotifications,
  }), [enableBrowserNotifications, markAllRead, permission, refresh, unread])

  return (
    <AnnouncementNotificationsContext.Provider value={value}>
      {children}
      {toast && session && (
        <div
          key={toast.key}
          role="status"
          aria-live="polite"
          className={`fixed bottom-4 right-4 z-50 w-[calc(100%-2rem)] max-w-sm rounded-2xl border-l-4 bg-[var(--color-surface)] p-4 shadow-2xl ring-1 ring-[var(--color-border)] ${toast.urgent ? 'border-l-red-700' : 'border-l-[var(--color-primary)]'}`}
        >
          <div className="flex items-start gap-3">
            <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-navigation-active-detail)] text-[var(--color-primary)]"><NavigationIcon name="bell" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold text-[var(--color-text)]">{toast.title}</p>
              <p className="mt-1 line-clamp-3 text-xs text-[var(--color-text-muted)]">{toast.body}</p>
              <button
                type="button"
                onClick={() => { setToast(null); navigate(announcementsPathForRole(session.role)) }}
                className="mt-3 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-bold text-white hover:opacity-90"
              >
                Ver avisos
              </button>
            </div>
            <button type="button" onClick={() => setToast(null)} aria-label="Fechar notificação" className="rounded-lg px-2 text-lg leading-none text-[var(--color-text-muted)] hover:text-[var(--color-text)]">×</button>
          </div>
        </div>
      )}
    </AnnouncementNotificationsContext.Provider>
  )
}
