import { createContext, useContext } from 'react'
import type { Comunicado } from '../types'
import type { DemoRole } from '../../session/types'

export type BrowserNotificationState = 'unsupported' | 'default' | 'granted' | 'denied'

export type AnnouncementNotificationsValue = {
  /** Avisos destinados ao usuário que ele ainda não abriu. */
  unreadCount: number
  unread: Comunicado[]
  /** Marca como lidos os avisos visíveis (ao abrir a tela de Avisos). */
  markAllRead: (ids?: string[]) => Promise<void>
  refresh: () => Promise<void>
  browserNotifications: BrowserNotificationState
  enableBrowserNotifications: () => Promise<void>
}

const noop = async () => undefined

export const AnnouncementNotificationsContext = createContext<AnnouncementNotificationsValue>({
  unreadCount: 0,
  unread: [],
  markAllRead: noop,
  refresh: noop,
  browserNotifications: 'unsupported',
  enableBrowserNotifications: noop,
})

export function useAnnouncementNotifications() {
  return useContext(AnnouncementNotificationsContext)
}

/** Endereço da tela de Avisos de cada perfil. */
export function announcementsPathForRole(role: DemoRole | undefined) {
  if (role === 'DIRECTOR_ADMIN') return '/administracao?view=avisos'
  if (role === 'SUPERVISOR') return '/supervisor?view=avisos'
  return '/colaborador/avisos'
}
