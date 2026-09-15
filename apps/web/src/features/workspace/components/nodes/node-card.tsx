'use client'

import { type ReactNode } from 'react'
import clsx from 'clsx'

type NodeCardProps = {
  icon?: ReactNode
  title: string
  subtitle?: string
  children?: ReactNode
  footer?: ReactNode
  accent?: boolean
  bodyClassName?: string
  width?: number
  badgeLabel?: string
  badgeTone?: 'neutral' | 'purple' | 'blue' | 'pink' | 'green' | 'orange'
}

const BADGE_CLASSNAME: Record<NonNullable<NodeCardProps['badgeTone']>, string> = {
  neutral: 'bg-canvas-panel text-canvas-text',
  purple: 'bg-canvas-primary/15 text-canvas-primary',
  blue: 'bg-canvas-primary/15 text-canvas-primary',
  pink: 'bg-rose-500/15 text-rose-400 dark:text-rose-200',
  green: 'bg-emerald-500/15 text-emerald-500 dark:text-emerald-200',
  orange: 'bg-amber-500/20 text-amber-600 dark:text-amber-200'
}

export function NodeCard({
  icon,
  title,
  subtitle,
  children,
  footer,
  accent = false,
  bodyClassName,
  width,
  badgeLabel,
  badgeTone = 'neutral'
}: NodeCardProps) {
  return (
    <div
      className={clsx(
        'group relative rounded-[32px] border transition-shadow',
        accent ? 'border-canvas-primary/40 bg-canvas-panel' : 'border-canvas-border/70 bg-canvas-surface/95',
        'shadow-[0px_30px_60px_-45px_rgba(19,91,236,0.35)] backdrop-blur'
      )}
      style={{ width: width ?? 360 }}
    >
      <div className="flex items-center gap-3 px-6 pb-2 pt-6">
        {icon && (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-canvas-primary/10 text-xl text-canvas-primary shadow-inner">
            {icon}
          </span>
        )}
        <div className="flex flex-col">
          <span className="text-lg font-semibold text-canvas-text">{title}</span>
          {subtitle && <span className="text-xs text-canvas-subtle">{subtitle}</span>}
        </div>
        {badgeLabel && (
          <span
            className={clsx(
              'ml-auto rounded-full px-3 py-1 text-[11px] font-medium',
              BADGE_CLASSNAME[badgeTone]
            )}
          >
            {badgeLabel}
          </span>
        )}
      </div>

      {children && (
        <div className={clsx('px-6 pb-6 text-sm text-canvas-text', bodyClassName)} data-testid="node-card-body">
          {children}
        </div>
      )}

      {footer && (
        <div className="flex items-center gap-3 rounded-b-[32px] border-t border-dashed border-canvas-border bg-canvas-panel px-6 py-4 text-xs text-canvas-subtle">
          {footer}
        </div>
      )}
    </div>
  )
}
