/**
 * Canvas 设计系统 tokens（v1 · refresh-2026-04）
 *
 * ⚠️ DESIGN SYSTEM 分裂提醒（P8 audit 发现）：
 *
 *   v1（这个文件）: TOKENS / NODE_HUE / IDEATION_HUE / NODE
 *   v2（新的）:   `src/shared/design-system/tokens-v2.ts`
 *                 → ink / paper / press / rules / bylineAccent / editorialTokens
 *
 * 两套 token 服务于**不同的视觉系统**，互不冲突：
 *   • v1 这一套是给 features/comfy/components/panels/* 的"工具面板"
 *     和 features/ideation/* 的旧 BMC 视图用的（cyan-on-slate dev-tool 美学）
 *   • v2 是 Editorial Boardroom 框架（ink-on-paper 报刊美学），
 *     用在 cc-bmc-card-node / canvas-live-coach / report-card-node 等
 *     v2 surface 上
 *
 * 不要混用 — 给 v2 surface 加 token 时去 tokens-v2.ts，给 panel 加 token
 * 来这里。如果未来要让两套统一，是一次大重构（20+ 文件迁移），不在
 * cleanup 范围内。
 *
 * ============================================================
 * v1 历史背景（保留）
 * ============================================================
 *
 * 现状：原画布堆叠 amber + cyan + emerald + slate 4 套渐变 + 多层阴影 + glow
 *       视觉过载，"AI 工具感" 被 "游戏 UI 感" 盖过。
 *
 * 目标：Linear / Vercel / Cursor 一类 dev-tool 美学：
 *   - 单一高对比 accent（cyan-300）替代 amber + cyan 双主色
 *   - 弃用 glow shadow，改 1px ring 表达 active
 *   - panel 内边距收紧 (p-4 → p-3)，卡片 24px 圆角 → 16px
 *   - 字号 11px 标签全部 uppercase + tracking
 *
 * 用法：
 *   import { TOKENS } from './canvas-design-tokens'
 *   <div className={TOKENS.surface.panel}> ... </div>
 *
 * 渐进迁移策略：
 *   旧组件继续用 inline className（不破坏）；新写或重构时用 TOKENS。
 *   迁移完一个组件 commit 一次，独立可回滚。
 */

export const TOKENS = {
  /** 表面 / 容器 */
  surface: {
    /** 主面板（左/右 rail 内部的卡片） */
    panel:
      'rounded-2xl border border-white/[0.07] bg-slate-900/40 backdrop-blur-xl ' +
      'shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset]',
    /** 子卡片（如 palette 里的每一个节点 entry） */
    card:
      'rounded-xl border border-white/[0.06] bg-slate-950/40 ' +
      'transition-colors hover:border-white/[0.14] hover:bg-slate-900/60',
    /** 工具栏 / header 玻璃面 */
    bar:
      'border-b border-white/[0.06] bg-slate-950/60 backdrop-blur-xl ' +
      'supports-[backdrop-filter]:bg-slate-950/40',
    /** 输入区域（textarea / input 包裹） */
    input:
      'rounded-xl border border-white/[0.08] bg-slate-950/50 ' +
      'transition-colors focus-within:border-cyan-300/40 ' +
      'focus-within:ring-1 focus-within:ring-cyan-300/20'
  },

  /** 文本层级 */
  text: {
    /** 主标题（h1 / h2） */
    h1: 'text-[15px] font-semibold tracking-tight text-white',
    /** 卡片标题 */
    h2: 'text-[13px] font-semibold text-white',
    /** 元数据（灰白） */
    meta: 'text-[12px] text-slate-400',
    /** 标签 / kicker（小写大写 tracking） */
    kicker:
      'text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500',
    /** 强调标签（accent 色 kicker） */
    kickerAccent:
      'text-[10px] font-medium uppercase tracking-[0.18em] text-cyan-300/90'
  },

  /** 按钮 */
  button: {
    /** 主按钮（CTA） */
    primary:
      'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg ' +
      'bg-cyan-400 px-3 py-1.5 text-[12px] font-semibold text-slate-950 ' +
      'transition-colors hover:bg-cyan-300 disabled:opacity-50 disabled:hover:bg-cyan-400',
    /** 幽灵按钮 */
    ghost:
      'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg ' +
      'border border-white/[0.08] bg-transparent px-3 py-1.5 text-[12px] font-medium text-slate-300 ' +
      'transition-colors hover:border-white/[0.16] hover:bg-white/[0.04] hover:text-white',
    /** 选中态切换按钮（segmented control 内部） */
    segmentActive:
      'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-white/[0.08] px-2.5 py-1.5 text-[12px] font-medium text-white',
    segmentIdle:
      'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[12px] font-medium text-slate-400 transition-colors hover:text-slate-200'
  },

  /** 状态色（替代原来 amber/emerald/cyan 三色乱用） */
  status: {
    idle: 'text-slate-400',
    active: 'text-cyan-300',
    success: 'text-emerald-300',
    warning: 'text-amber-300',
    danger: 'text-rose-300'
  },

  /** ring（替代 glow shadow 表达 active） */
  ring: {
    active: 'ring-1 ring-cyan-300/40',
    danger: 'ring-1 ring-rose-300/40'
  }
} as const

/** Stitch 风格的 ComfyUI 节点配色（每类节点固定 hue） */
export const NODE_HUE: Record<string, { bg: string; text: string; ring: string }> = {
  agent: { bg: 'bg-cyan-400/10', text: 'text-cyan-300', ring: 'ring-cyan-400/30' },
  bmc: { bg: 'bg-amber-400/10', text: 'text-amber-300', ring: 'ring-amber-400/30' },
  data: { bg: 'bg-sky-400/10', text: 'text-sky-300', ring: 'ring-sky-400/30' },
  insight: { bg: 'bg-violet-400/10', text: 'text-violet-300', ring: 'ring-violet-400/30' },
  conflict: { bg: 'bg-rose-400/10', text: 'text-rose-300', ring: 'ring-rose-400/30' },
  misc: { bg: 'bg-slate-400/10', text: 'text-slate-300', ring: 'ring-slate-400/30' }
}

/**
 * Ideation Canvas hue palette (Stage A).
 *
 * Per-kind colors map to the 9 ideation node kinds. Each entry exposes:
 *   - hex: raw hex (used for accent line / handle ports / inline style props
 *          where a Tailwind class won't compose, e.g. boxShadow)
 *   - bg / text / chip: Tailwind utility groups for the hue-tinted regions
 *
 * Hex values are kept here (not in tailwind.config.ts) because Tailwind JIT
 * handles `text-cyan-300` etc. natively, but inline `style.boxShadow` needs
 * the literal hex.
 */
export const IDEATION_HUE: Record<
  string,
  {
    hex: string
    bg: string
    text: string
    chip: string
    softBg: string
  }
> = {
  // 根想法 · cyan-300
  'core-idea': {
    hex: '#67e8f9',
    bg: 'bg-cyan-400/15',
    text: 'text-cyan-300',
    chip: 'bg-cyan-400/15 text-cyan-200',
    softBg: 'bg-cyan-400/[0.06]'
  },
  // 客户痛点 · rose-300
  'customer-pain': {
    hex: '#fda4af',
    bg: 'bg-rose-400/15',
    text: 'text-rose-300',
    chip: 'bg-rose-400/15 text-rose-200',
    softBg: 'bg-rose-400/[0.06]'
  },
  // 价值角度 · amber-300
  'value-angle': {
    hex: '#fcd34d',
    bg: 'bg-amber-400/15',
    text: 'text-amber-300',
    chip: 'bg-amber-400/15 text-amber-200',
    softBg: 'bg-amber-400/[0.06]'
  },
  // 假设 · violet-300
  hypothesis: {
    hex: '#c4b5fd',
    bg: 'bg-violet-400/15',
    text: 'text-violet-300',
    chip: 'bg-violet-400/15 text-violet-200',
    softBg: 'bg-violet-400/[0.06]'
  },
  // 验证渠道 · sky-300
  'validation-channel': {
    hex: '#7dd3fc',
    bg: 'bg-sky-400/15',
    text: 'text-sky-300',
    chip: 'bg-sky-400/15 text-sky-200',
    softBg: 'bg-sky-400/[0.06]'
  },
  // 收入流 · emerald-300
  revenue: {
    hex: '#6ee7b7',
    bg: 'bg-emerald-400/15',
    text: 'text-emerald-300',
    chip: 'bg-emerald-400/15 text-emerald-200',
    softBg: 'bg-emerald-400/[0.06]'
  },
  // 风险 · orange-300
  risk: {
    hex: '#fdba74',
    bg: 'bg-orange-400/15',
    text: 'text-orange-300',
    chip: 'bg-orange-400/15 text-orange-200',
    softBg: 'bg-orange-400/[0.06]'
  },
  // 证据 · slate-300（中性灰，证据不应抢眼）
  evidence: {
    hex: '#cbd5e1',
    bg: 'bg-slate-400/15',
    text: 'text-slate-300',
    chip: 'bg-slate-400/15 text-slate-200',
    softBg: 'bg-slate-400/[0.06]'
  },
  // AI 反思 · indigo-300（与 cyan/violet 区分）
  reflection: {
    hex: '#a5b4fc',
    bg: 'bg-indigo-400/15',
    text: 'text-indigo-300',
    chip: 'bg-indigo-400/15 text-indigo-200',
    softBg: 'bg-indigo-400/[0.06]'
  }
}

/**
 * Shared classes for React Flow nodes (refresh-2026-04).
 *
 * Use these to replace the per-node ad-hoc shells. They give every node:
 *  - identical backdrop-blur surface
 *  - a 1-px white/8 border (instead of glow shadow)
 *  - a 1-px white/14 border on hover (no scale, no glow)
 *  - a 1-px cyan-300/30 ring on selection (caller adds via React Flow's
 *    `selected` prop)
 *
 * Per-domain accent colors (e.g. BMC card hue per dimension) stay as
 * inline-style (since 9-color palette is too wide for tokens), but the SHELL
 * around them stays neutral — accent shows as a left border or chip only.
 */
export const NODE = {
  /** Default node shell — unselected */
  shell:
    'rounded-xl border border-white/[0.08] bg-slate-900/50 backdrop-blur-xl ' +
    'transition-colors hover:border-white/[0.16]',
  /** Selected variant (caller adds when selected) */
  shellSelected: 'border-cyan-300/40 ring-1 ring-cyan-300/30',
  /** Standard handle port style (replaces ad-hoc per-color handles) */
  handle:
    'h-2.5 w-2.5 rounded-full border border-slate-950 bg-slate-400 ' +
    'transition-colors hover:bg-cyan-300'
}
