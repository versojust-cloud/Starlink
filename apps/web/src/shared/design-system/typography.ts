/**
 * Editorial Boardroom v2 typography stack — three font roles:
 *
 *   Display serif → Fraunces (variable opsz, OFL — @import in globals.css)
 *   Body sans     → Geist Sans (geist npm, OFL — bundled, no fetch)
 *   Technical mono→ JetBrains Mono (OFL — @import in globals.css)
 *
 * Geist ships its font files with the npm package, so it loads via
 * next/font without a network fetch. Fraunces and JetBrains Mono are
 * fetched browser-side via plain CSS @import in globals.css — Next's
 * compile-time next/font/google was observed to hang on flaky upstream
 * connectivity, and browser @import lets the page render with system
 * fallback while the font streams in.
 *
 * Tailwind's `font-display` / `font-body` / `font-instr` classes
 * resolve to the variables exposed below.
 */

import { GeistSans } from 'geist/font/sans'

export const geist = GeistSans

export const cssFontVars = {
  fraunces:      '--font-fraunces',
  jetbrainsMono: '--font-jetbrains-mono',
} as const

export const typography = {
  display: 'font-display',
  body:    'font-sans',
  mono:    'font-mono',
} as const

export const scale = {
  kicker:  '10px',
  meta:    '11px',
  body:    '14px',
  lead:    '17px',
  subhead: '22px',
  display: '40px',
} as const

export const fontVariables = geist.variable
