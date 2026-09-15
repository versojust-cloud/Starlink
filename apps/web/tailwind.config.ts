import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './lib/**/*.{js,ts,jsx,tsx}',
    // Editorial Boardroom v2 (P1, 2026-05-01): scan src/ so v2 tokens
    // and the new design-system/ utilities are picked up. Without this
    // the v2 classes get tree-shaken out of the production CSS.
    './src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        canvas: {
          primary: "hsl(var(--canvas-primary))",
          bg: "hsl(var(--canvas-bg))",
          surface: "hsl(var(--canvas-surface))",
          panel: "hsl(var(--canvas-panel))",
          card: "hsl(var(--canvas-card))",
          border: "hsl(var(--canvas-border))",
          text: "hsl(var(--canvas-text))",
          muted: "hsl(var(--canvas-muted))",
          subtle: "hsl(var(--canvas-subtle))",
          grid: "hsl(var(--canvas-grid))",
        },
        slate: {
          950: '#020617'
        },
        // Business canvas dark palette
        graph: {
          canvas: '#1a1a1a',
          grid: '#2a2a2a',
          node: '#2d2d2d',
          nodeBorder: '#444444',
          nodeHover: '#3a3a3a',
          wire: '#4ade80',
          wireActive: '#22c55e',
          wireHover: '#86efac',
        },
        // ============================================================
        // Editorial Boardroom v2 (P1, 2026-05-01)
        // ============================================================
        // Source of truth: src/shared/design-system/tokens-v2.ts.
        // Old palettes above are kept for back-compat during P2/P3
        // migration; P4 deletes any of those that are unused.
        ink: {
          DEFAULT: '#0A0A0A',
          ash1: '#161514',
          ash2: '#2A2826',
          ash3: '#4A4744',
          ash4: '#8A8784',
        },
        paper: {
          DEFAULT: '#F4F0E8',
          ash1: '#ECEAE4',
          ash2: '#D8D5CE',
          ash3: '#6E6B66',
        },
        press: {
          DEFAULT: '#B33028',
          active: '#8F2620',
          wash:    '#F2D6D2',
        },
        // Per-agent byline accents (used as kicker tints, NOT
        // for fills). All muted on purpose — these are reading aids,
        // not decoration. Press-red is reserved separately.
        byline: {
          market:      '#9B8E70',
          product:     '#7A8B7E',
          finance:     '#6E7A8C',
          critic:      '#8C6E6E',
          synthesizer: '#6B6B7C',
        },
        // Stratum Engine — light-theme strategy canvas palette. Used
        // by /canvas/* surfaces (light dot-grid, white agent cards,
        // navy/sky-blue accents). Does NOT replace ink/paper anywhere
        // else; v2 surfaces (drawers, dialogs, dashboards) keep ink.
        stratum: {
          surface:        '#F7F9FB',
          'surface-low':  '#F2F4F6',
          'surface-raised':'#FFFFFF',
          panel:          '#EEF2F6',
          ink:            '#191C1E',
          muted:          '#6B7280',
          line:           'rgba(19, 27, 46, 0.08)',
          navy:           '#131B2E',
          'navy-soft':    '#1E2A44',
          blue:           '#008CC7',
          sky:            '#89CEFF',
          ok:             '#1F8E5A',
          'ok-wash':      '#DCEFE3',
          warn:           '#C26A1F',
          danger:         '#BA1A1A',
          'danger-wash':  '#FFDAD6',
        },
      },
      fontFamily: {
        // v2 font roles. Use via `font-display` / `font-body` /
        // `font-instr` (instrument). The CSS variables come from
        // next/font configs in src/shared/design-system/typography.ts
        // and are bound on <html> in app/layout.tsx.
        display: ['var(--font-fraunces)',       'ui-serif', 'Georgia', 'serif'],
        body:    ['var(--font-geist-sans)',     'ui-sans-serif', 'system-ui', 'sans-serif'],
        instr:   ['var(--font-jetbrains-mono)', 'ui-monospace', 'monospace'],
      },
      backgroundImage: {
        // Paper grain texture. Apply via `bg-grain-paper` on a relative
        // container — uses the SVG filter at /editorial-grain.svg. Use
        // sparingly; one grain layer per visible region is plenty.
        'grain-paper': "url('/editorial-grain.svg')",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        card: '0 12px 40px -16px rgba(15, 118, 230, 0.35)'
      },
      keyframes: {
        'rotate-y-180': {
          from: {
            transform: 'rotateY(0deg)'
          },
          to: {
            transform: 'rotateY(180deg)'
          }
        },
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        // Editorial Boardroom v2 — only 2 CSS keyframes are allowed
        // (the third, pageFold, is Framer Motion only). See
        // src/shared/design-system/motion.ts for the canonical spec.
        'editorial-publish': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'editorial-swap': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
      },
      animation: {
        'rotate-y-180': 'rotate-y-180 0.6s ease-in-out',
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        // v2 — durations match motion.ts
        'editorial-publish': 'editorial-publish 80ms cubic-bezier(0.25,0.1,0.25,1)',
        'editorial-swap':    'editorial-swap 120ms linear',
      },
      letterSpacing: {
        // Newspaper kicker convention — UPPERCASE 10px tracking 0.18em
        kicker: '0.18em',
      },
      maxWidth: {
        // Reading measure caps from tokens-v2.ts (newspaper typography
        // research: 60-75ch optimal). Use as `max-w-measure-body`.
        'measure-body':    '64ch',
        'measure-cell':    '52ch',
        'measure-display': '32ch',
      }
    }
  },
  plugins: []
}

export default config
