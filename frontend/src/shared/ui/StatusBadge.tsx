import type { HTMLAttributes, ReactNode } from 'react'

export type StatusTone =
  | 'neutral'
  | 'info'
  | 'pending'
  | 'warning'
  | 'success'
  | 'danger'
  | 'cancelled'

type StatusBadgeProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  children: ReactNode
  tone: StatusTone
  size?: 'compact' | 'regular'
}

const spacingBySize = {
  compact: 'px-2.5 py-1',
  regular: 'px-3 py-1.5',
} as const

export function StatusBadge({ children, className = '', size = 'compact', tone, ...props }: StatusBadgeProps) {
  return (
    <span
      {...props}
      className={`status-badge status-badge--${tone} inline-flex items-center rounded-full border text-xs font-bold ${spacingBySize[size]} ${className}`.trim()}
      data-status-tone={tone}
    >
      {children}
    </span>
  )
}
