'use client'

/**
 * P11.18 · Agent health chip + popover detail panel.
 *
 * Polls GET /health/agents every 30s. When any agent is `degraded`
 * (error rate ≥ AGENT_SLO_DEGRADED_THRESHOLD on the server, default
 * 30%), shows a press-red chip with the count. Otherwise hidden.
 *
 * Click the chip to expand a floating panel showing per-agent SLO
 * snapshots: latency p50/p95, error/fallback rates, lifetime totals.
 *
 * Lives in the bottom-right action zone next to Layers / KB buttons.
 */

import { useEffect, useState, useRef } from 'react'
import { AlertTriangle, Activity, X } from 'lucide-react'

type AgentSnapshot = {
  agentId: string
  windowSize: number
  errorRate: number
  fallbackRate: number
  latencyP50Ms: number
  latencyP95Ms: number
  totals: { invocations: number; errors: number; fallbacks: number }
  degraded: boolean
}

type HealthResponse = {
  degradedCount: number
  agents: AgentSnapshot[]
}

const POLL_MS = 30_000
const HEALTH_URL = (() => {
  // Server is on PORT 4000 in dev; in prod it's reverse-proxied so
  // same-origin /health/agents works. In dev, any port that ISN'T
  // 4000 means the frontend is on a different origin and should
  // cross-domain to localhost:4000 directly. Override via env if
  // the backend lives elsewhere.
  if (typeof window === 'undefined') return '/health/agents'
  const envOverride = process.env.NEXT_PUBLIC_API_BASE_URL
  if (envOverride) return `${envOverride.replace(/\/$/, '')}/health/agents`
  if (window.location.port && window.location.port !== '4000') {
    return 'http://localhost:4000/health/agents'
  }
  return '/health/agents'
})()

export function AgentHealthChip() {
  const [data, setData] = useState<HealthResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let cancelled = false
    const fetchOnce = async () => {
      try {
        const res = await fetch(HEALTH_URL, { cache: 'no-store' })
        // 503 still returns a JSON body (any-degraded path) — read it.
        const j = (await res.json()) as HealthResponse
        if (!cancelled) {
          setData(j)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    }
    void fetchOnce()
    timer.current = setInterval(() => void fetchOnce(), POLL_MS)
    return () => {
      cancelled = true
      if (timer.current) clearInterval(timer.current)
    }
  }, [])

  // Always show a small "Activity" indicator if at least one agent has
  // run; expand to red chip when any are degraded. If we can't reach
  // the server, show nothing (don't pollute the canvas with infra noise).
  if (error || !data) return null
  if (data.agents.length === 0) return null

  const degraded = data.degradedCount > 0
  const Icon = degraded ? AlertTriangle : Activity

  return (
    <div className="absolute bottom-6 right-6 z-30 pointer-events-auto">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        // Editorial brutalist chip: 1.5px navy border establishes weight
        // even when idle (was border-stratum-line, too thin to register).
        // Status-LED dot replaces the lucide Activity icon — squarer,
        // more "instrument panel" than chatbot. Mono kicker `SLO ·`
        // prefix gives the chip a clear identity.
        className={`group flex items-center gap-2 rounded-full border-[1.5px] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors ${
          degraded
            ? 'border-press bg-press text-white hover:bg-press-active'
            : 'border-stratum-navy bg-white text-stratum-navy hover:bg-stratum-surface-low'
        }`}
        aria-label={degraded ? `${data.degradedCount} agent(s) degraded` : 'Agent SLO health panel'}
      >
        {degraded ? (
          <AlertTriangle className="h-3 w-3" strokeWidth={2.25} />
        ) : (
          // 6px LED — sharp filled circle reads as a status indicator
          // rather than a generic icon. Subtle pulse on hover hints
          // "this is live" without being noisy in idle state.
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-stratum-blue group-hover:animate-pulse"
          />
        )}
        <span className="tabular-nums">
          {degraded
            ? `${data.degradedCount} DEGRADED`
            : `SLO · ${data.agents.length}`}
        </span>
      </button>

      {open && (
        <div className="absolute bottom-10 right-0 w-[420px] max-h-[60vh] overflow-y-auto border-[1.5px] border-stratum-navy bg-white shadow-2xl">
          <div className="sticky top-0 flex items-center justify-between border-b-[1.5px] border-stratum-navy bg-stratum-surface-low px-4 py-3">
            <div className="flex items-center gap-2">
              <Icon
                className={`h-4 w-4 ${degraded ? 'text-press' : 'text-stratum-blue'}`}
                strokeWidth={1.75}
              />
              <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-stratum-navy">
                Agent SLO · {data.agents.length} active
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full p-1 text-stratum-muted transition-colors hover:bg-stratum-line hover:text-stratum-ink"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          </div>

          <ul className="divide-y divide-stratum-line">
            {data.agents.map((a) => (
              <li key={a.agentId} className={`px-4 py-3 ${a.degraded ? 'bg-press-wash/40' : ''}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-[12px] font-medium text-stratum-ink truncate">
                    {a.agentId}
                  </span>
                  {a.degraded && (
                    <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-press">
                      degraded
                    </span>
                  )}
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-x-2 gap-y-0.5 font-mono text-[10px] tabular-nums text-stratum-muted">
                  <span>p50: <span className="text-stratum-ink">{a.latencyP50Ms}ms</span></span>
                  <span>p95: <span className="text-stratum-ink">{a.latencyP95Ms}ms</span></span>
                  <span>err: <span className={a.errorRate > 0 ? 'text-press' : 'text-stratum-ink'}>{(a.errorRate * 100).toFixed(1)}%</span></span>
                  <span className="col-span-3 text-stratum-muted/70">
                    n={a.totals.invocations} · errors={a.totals.errors} · fallbacks={a.totals.fallbacks} · window={a.windowSize}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <div className="border-t-[1px] border-stratum-line px-4 py-2 font-mono text-[9px] uppercase tracking-[0.14em] text-stratum-muted">
            polled every {POLL_MS / 1000}s · /health/agents
          </div>
        </div>
      )}
    </div>
  )
}
