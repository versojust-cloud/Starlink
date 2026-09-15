'use client'

import { useEffect, useState } from 'react'
import { useTheme as useNextTheme } from 'next-themes'
import { useTheme as useAppTheme } from '@/lib/theme'

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false)
  const mode = useAppTheme((state) => state.mode)
  const setAppTheme = useAppTheme((state) => state.setTheme)
  const { setTheme } = useNextTheme()

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <span
        aria-hidden="true"
        className="block h-8 w-[70px] rounded-full border border-[#E4DBFF] bg-white/80 dark:border-slate-700 dark:bg-slate-900"
      />
    )
  }

  const isDark = mode === 'dark'
  const nextMode = isDark ? 'light' : 'dark'

  return (
    <button
      type="button"
      onClick={() => {
        setAppTheme(nextMode)
        setTheme(nextMode)
      }}
      className="group relative inline-flex h-8 w-[70px] items-center rounded-full border border-[#DDD2FF] bg-[#F3EEFF] p-1 shadow-[0_10px_30px_-22px_rgba(109,74,255,0.9)] transition focus:outline-none focus:ring-2 focus:ring-[#8B7CFF]/60 focus:ring-offset-2 dark:border-slate-700 dark:bg-slate-900"
      aria-label={isDark ? '切换到浅色模式' : '切换到深色模式'}
      title={isDark ? '切换到浅色模式' : '切换到深色模式'}
    >
      <span className="absolute inset-1 rounded-full bg-gradient-to-r from-[#EFE8FF] to-[#FFFFFF] dark:from-slate-900 dark:to-slate-800" />
      <span
        className={`absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#6E5BFF] shadow-sm transition-transform duration-300 dark:bg-slate-800 dark:text-slate-100 ${
          isDark ? 'translate-x-[38px]' : 'translate-x-0'
        }`}
      >
        {isDark ? (
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0M17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414M4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
              clipRule="evenodd"
            />
          </svg>
        ) : (
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
          </svg>
        )}
      </span>

      <span className="relative z-10 flex w-full items-center justify-between px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7B6FA6] dark:text-slate-400">
        <span className={`transition ${!isDark ? 'opacity-100' : 'opacity-40 group-hover:opacity-70'}`}>Light</span>
        <span className={`transition ${isDark ? 'opacity-100' : 'opacity-40 group-hover:opacity-70'}`}>Dark</span>
      </span>
    </button>
  )
}
