'use client'

import { useEffect, useRef, useState } from 'react'

/** Stub -- replace with your actual execution store hook. */
interface ExecutionState {
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress: number
  runningCount: number
  completedCount: number
  failedCount: number
  startedAt: number | null
}

function useExecutionStore(): ExecutionState & {
  execute: () => void
  cancel: () => void
} {
  return {
    status: 'idle',
    progress: 0,
    runningCount: 0,
    completedCount: 0,
    failedCount: 0,
    startedAt: null,
    execute: () => {},
    cancel: () => {},
  }
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

interface ExecutionBarProps {
  workspaceId?: string
}

export function ExecutionBar({ workspaceId }: ExecutionBarProps) {
  const { status, progress, runningCount, completedCount, failedCount, startedAt, execute, cancel } =
    useExecutionStore()

  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (status === 'running' && startedAt) {
      timerRef.current = setInterval(() => {
        setElapsed(Date.now() - startedAt)
      }, 500)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
      if (status === 'idle') setElapsed(0)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [status, startedAt])

  const isRunning = status === 'running'

  return (
    <div
      className="flex items-center gap-4 border-t border-gray-200 bg-white px-4 py-2 dark:border-gray-700 dark:bg-gray-900"
      data-workspace-id={workspaceId ?? 'global'}
    >
      {/* Progress bar */}
      <div className="h-2 min-w-[120px] flex-1 rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            status === 'failed'
              ? 'bg-red-500'
              : status === 'completed'
                ? 'bg-green-500'
                : 'bg-indigo-500'
          }`}
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>

      {/* Counts */}
      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-blue-500" />
          {runningCount} running
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          {completedCount} done
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          {failedCount} failed
        </span>
      </div>

      {/* Timer */}
      <span className="min-w-[48px] text-right font-mono text-xs text-gray-500 dark:text-gray-400">
        {formatElapsed(elapsed)}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={execute}
          disabled={isRunning}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Execute
        </button>
        <button
          onClick={cancel}
          disabled={!isRunning}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
