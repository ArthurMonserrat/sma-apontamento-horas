import { useAnnouncementNotifications } from './announcementNotificationsContext'

/** Bolinha com o número de avisos não lidos, ao lado de "Avisos" no menu. */
export function AnnouncementBadge() {
  const { unreadCount } = useAnnouncementNotifications()
  if (unreadCount <= 0) return null
  const label = unreadCount > 9 ? '9+' : String(unreadCount)
  return (
    <span
      className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] font-extrabold leading-none text-white"
      aria-label={`${unreadCount} aviso(s) não lido(s)`}
      title={`${unreadCount} aviso(s) não lido(s)`}
    >
      {label}
    </span>
  )
}
