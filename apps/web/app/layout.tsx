import type { Metadata } from 'next'
import './globals.css'
import { Providers } from '@/shared/components'
import { fontVariables } from '@/shared/design-system/typography'

export const metadata: Metadata = {
  title: 'starlink · 智绘画布',
  description: 'starlink · Multi-Agent Strategy Canvas — 12-agent CC-BMC workshop',
  icons: {
    icon: '/favicon-32.png',
    shortcut: '/favicon-32.png'
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={fontVariables}>
      {/*
        P12 fix · default text-paper (#F4F0E8 warm off-white) was
        inheriting into every light-surface descendant (drawers,
        modals, KB cards) where bg is overridden to white/gray but
        text isn't, making body text near-invisible. Switch the
        default to text-stratum-ink (dark) which contrasts with
        the common light surfaces. Ink-themed (dark-bg) pages are
        responsible for re-setting text-paper on their own root.
      */}
      <body className="min-h-screen bg-stratum-surface text-stratum-ink antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
