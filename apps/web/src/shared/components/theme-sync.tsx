'use client'

import { useEffect, useRef } from 'react'
import { useTheme as useNextTheme } from 'next-themes'
import { useTheme as useAppTheme } from '@/lib/theme'

export function ThemeSync() {
  const initializedRef = useRef(false)
  const mode = useAppTheme((state) => state.mode)
  const setAppTheme = useAppTheme((state) => state.setTheme)
  const { theme, setTheme } = useNextTheme()

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true
    if (theme !== mode) {
      setTheme(mode)
    }
  }, [mode, setTheme, theme])

  useEffect(() => {
    if (!initializedRef.current) return
    if (theme !== 'light' && theme !== 'dark') return
    if (theme !== mode) {
      setAppTheme(theme)
    }
  }, [mode, setAppTheme, theme])

  return null
}
