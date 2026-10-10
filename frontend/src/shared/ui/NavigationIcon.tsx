import type { ReactNode } from 'react'

export type NavigationIconName =
  | 'bar-chart'
  | 'bell'
  | 'calendar-off'
  | 'dashboard'
  | 'file-plus'
  | 'history'
  | 'inbox'
  | 'user'
  | 'users'

type NavigationIconProps = {
  name: NavigationIconName
}

function iconContent(name: NavigationIconName): ReactNode {
  switch (name) {
    case 'dashboard':
      return <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>
    case 'file-plus':
      return <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M12 18v-6m-3 3h6" /></>
    case 'history':
      return <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5m4-4v7l4 2" /></>
    case 'calendar-off':
      return <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18M4 4l16 16" /></>
    case 'bell':
      return <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>
    case 'user':
      return <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>
    case 'users':
      return <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>
    case 'inbox':
      return <><path d="M4 4h16v16H4zM4 13h5l2 3h2l2-3h5" /></>
    case 'bar-chart':
      return <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>
  }
}

export function NavigationIcon({ name }: NavigationIconProps) {
  return (
    <svg data-navigation-icon={name} aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      {iconContent(name)}
    </svg>
  )
}
