import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'

type ToolTheme = 'ocean' | 'amber' | 'emerald' | 'ember'

type ToolHeroStat = {
  label: string
  value: string
  detail?: string
}

type ToolHeroCardProps = {
  theme?: ToolTheme
  eyebrow: string
  title: string
  description: string
  actions?: ReactNode
  stats?: ToolHeroStat[]
}

type ToolPanelProps = {
  className?: string
  eyebrow?: string
  title?: string
  children: ReactNode
}

const themeMap: Record<
  ToolTheme,
  {
    shell: string
    eyebrow: string
    orb: string
    stat: string
    title: string
  }
> = {
  ocean: {
    shell:
      'border-[rgba(137,206,255,0.38)] bg-[linear-gradient(135deg,rgba(234,244,255,0.96)_0%,rgba(255,255,255,0.98)_42%,rgba(245,249,255,0.96)_100%)]',
    eyebrow: 'bg-[#eaf4ff] text-[var(--stratum-blue)]',
    orb: 'from-sky-300/40 via-cyan-200/20 to-transparent',
    stat: 'border-[rgba(137,206,255,0.32)] bg-white/75',
    title: 'text-[var(--stratum-navy)]'
  },
  amber: {
    shell:
      'border-[rgba(245,158,11,0.28)] bg-[linear-gradient(135deg,rgba(255,247,237,0.98)_0%,rgba(255,255,255,0.98)_44%,rgba(255,251,235,0.96)_100%)]',
    eyebrow: 'bg-amber-100 text-amber-700',
    orb: 'from-amber-300/45 via-orange-200/18 to-transparent',
    stat: 'border-[rgba(245,158,11,0.22)] bg-white/78',
    title: 'text-[#44210d]'
  },
  emerald: {
    shell:
      'border-[rgba(16,185,129,0.25)] bg-[linear-gradient(135deg,rgba(236,253,245,0.98)_0%,rgba(255,255,255,0.98)_44%,rgba(240,253,250,0.96)_100%)]',
    eyebrow: 'bg-emerald-100 text-emerald-700',
    orb: 'from-emerald-300/40 via-teal-200/18 to-transparent',
    stat: 'border-[rgba(16,185,129,0.18)] bg-white/78',
    title: 'text-[#103127]'
  },
  ember: {
    shell:
      'border-[rgba(251,113,133,0.24)] bg-[linear-gradient(135deg,rgba(255,241,242,0.98)_0%,rgba(255,255,255,0.98)_44%,rgba(255,247,237,0.96)_100%)]',
    eyebrow: 'bg-rose-100 text-rose-700',
    orb: 'from-rose-300/42 via-orange-200/16 to-transparent',
    stat: 'border-[rgba(251,113,133,0.18)] bg-white/78',
    title: 'text-[#3d1f28]'
  }
}

export function ToolHeroCard({
  theme = 'ocean',
  eyebrow,
  title,
  description,
  actions,
  stats = []
}: ToolHeroCardProps) {
  const palette = themeMap[theme]

  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-[32px] border p-6 shadow-[0_28px_90px_rgba(15,23,42,0.08)]',
        palette.shell
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute right-[-6rem] top-[-5rem] h-56 w-56 rounded-full bg-gradient-to-br blur-3xl',
          palette.orb
        )}
      />

      <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <span
            className={cn(
              'inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em]',
              palette.eyebrow
            )}
          >
            {eyebrow}
          </span>
          <h1 className={cn('stratum-display mt-5 text-4xl font-semibold leading-[0.95] md:text-5xl', palette.title)}>
            {title}
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600 md:text-[15px]">
            {description}
          </p>
          {actions ? <div className="mt-6 flex flex-wrap items-center gap-3">{actions}</div> : null}
        </div>

        {stats.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
            {stats.map((stat) => (
              <article
                key={stat.label}
                className={cn('rounded-[24px] border p-4 backdrop-blur', palette.stat)}
              >
                <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">{stat.label}</p>
                <p className="mt-3 text-3xl font-semibold text-[var(--stratum-ink)]">{stat.value}</p>
                {stat.detail ? <p className="mt-2 text-xs leading-5 text-slate-500">{stat.detail}</p> : null}
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}

export function ToolPanel({ className, eyebrow, title, children }: ToolPanelProps) {
  return (
    <section className={cn('stratum-card rounded-[28px] p-5', className)}>
      {eyebrow ? (
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">{eyebrow}</p>
      ) : null}
      {title ? <h2 className="stratum-display mt-3 text-2xl font-semibold text-[var(--stratum-ink)]">{title}</h2> : null}
      <div className={cn(title ? 'mt-4' : eyebrow ? 'mt-3' : '')}>{children}</div>
    </section>
  )
}
