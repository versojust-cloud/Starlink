'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ThemeMode, Theme } from './types'
import { themes } from './config'

interface ThemeStore {
  mode: ThemeMode
  theme: Theme
  toggleTheme: () => void
  setTheme: (mode: ThemeMode) => void
}

export const useTheme = create<ThemeStore>()(
  persist(
    (set, get) => ({
      mode: 'light',
      theme: themes.light,

      toggleTheme: () => {
        const newMode = get().mode === 'light' ? 'dark' : 'light'
        set({
          mode: newMode,
          theme: themes[newMode]
        })
      },

      setTheme: (mode: ThemeMode) => {
        set({
          mode,
          theme: themes[mode]
        })
      }
    }),
    {
      name: 'starlink-theme-storage',
      // 只持久化mode，theme根据mode自动派生
      partialize: (state) => ({ mode: state.mode })
    }
  )
)
