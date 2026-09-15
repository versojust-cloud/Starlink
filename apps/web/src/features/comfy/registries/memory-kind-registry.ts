/**
 * Memory-kind registry — pluggable dictionary mapping `MemoryItem.kind`
 * to its visual treatment (icon / tint / label / sort priority).
 *
 * Extension: to add a new memory kind (e.g. 'risk', 'commitment',
 * 'assumption'), append a new entry to KIND_REGISTRY at module load
 * time. The Memory tab + UserSkillChip iterate this registry, so any
 * registered kind appears in the UI without changing render code.
 *
 * Backend kinds (memoryKindSchema in @starlink/shared):
 *   preference / decision / insight / constraint / summary / canvas / user-skill
 * Plus arbitrary future kinds — graceful fallback rendering for unknown.
 */

import type { LucideIcon } from 'lucide-react'
import {
  Bookmark,
  GitBranch,
  Lightbulb,
  Lock,
  FileText,
  LayoutPanelTop,
  User2,
  Sparkles,
} from 'lucide-react'

/**
 * P14 P2 · live MemoryKind values (server enum). The 3 deprecated values
 * (`preference` / `insight` / `constraint`) had 0 production write sites
 * audited 2026-05-09 and were dropped from the server enum, but UI still
 * accepts them as a fallback for legacy DB rows that pre-date the cleanup.
 */
export type MemoryKindKey =
  | 'decision'
  | 'summary'
  | 'canvas'
  | 'user-skill'
  // Deprecated below — kept here so the registry can render legacy rows:
  | 'preference'
  | 'insight'
  | 'constraint'
  | (string & {})

/**
 * P14 · canonical 5-layer hierarchy for memory_items (replaces legacy
 * `scope`). Matches `packages/shared/src/schemas/memory.ts`.
 */
export type MemoryLayerKey = 'session' | 'workspace' | 'user' | 'global'

/**
 * P14 · cognitive-science facet for memory content classification
 * (replaces the lifecycle-axis half of legacy `kind`).
 */
export type MemoryFacetKey = 'episodic' | 'semantic' | 'procedural'

/**
 * Layer registry — short Mandarin label + color tint for chip rendering
 * in the memory drawer. Matches `tokens-v2.ts` byline accents so layers
 * are visually distinguishable but not screaming.
 */
export const MEMORY_LAYER_REGISTRY: Record<MemoryLayerKey, { label: string; tintClass: string; description: string }> = {
  session:   { label: '本会话', tintClass: 'text-stratum-blue',   description: 'L1 · 当前对话内的临时记忆（30 日 TTL）' },
  workspace: { label: '本画布', tintClass: 'text-byline-product', description: 'L2 · 一个 idea 内的记忆（90 日 TTL）' },
  user:      { label: '跨画布', tintClass: 'text-byline-market',  description: 'L3 · 用户级长期画像（永久）' },
  global:    { label: '全局',   tintClass: 'text-stratum-muted',  description: 'L4 · 知识库（独立表 kb_chunks）' }
}

/**
 * Facet registry — cognitive-science labels mirroring how the memory
 * literature partitions long-term memory (episodic = events, semantic =
 * facts, procedural = how-to).
 */
export const MEMORY_FACET_REGISTRY: Record<MemoryFacetKey, { label: string; tintClass: string; description: string }> = {
  episodic:   { label: '情节记忆', tintClass: 'text-byline-product', description: '一次具体经历（会话总结、决策、画布快照）' },
  semantic:   { label: '语义记忆', tintClass: 'text-byline-market',  description: '抽象的事实/技能（用户画像、偏好、约束）' },
  procedural: { label: '过程记忆', tintClass: 'text-stratum-muted',  description: '怎么做（工作流模板，当前未启用）' }
}

export type MemoryKindDescriptor = {
  key: MemoryKindKey
  /** Short display label (Chinese, used in UI) */
  label: string
  /** Stratum tint class for the kind chip + accent line */
  tintClass: string
  /** Icon shown next to the title */
  icon: LucideIcon
  /** Sort priority (lower = top of list when grouping by kind) */
  sortOrder: number
  /** One-line semantic — appears in tooltip */
  description: string
}

const KIND_REGISTRY: Record<string, MemoryKindDescriptor> = {
  'user-skill': {
    key: 'user-skill',
    label: '用户画像',
    tintClass: 'text-stratum-blue',
    icon: User2,
    sortOrder: 0,
    description: '跨会话提取的用户长期偏好与背景',
  },
  decision: {
    key: 'decision',
    label: '决策',
    tintClass: 'text-stratum-navy',
    icon: GitBranch,
    sortOrder: 1,
    description: '已敲定的关键选择',
  },
  // P14 P2 · the 3 entries below are deprecated — server stopped writing
  // them 2026-05-09 (0 production sites). Kept so the UI can still render
  // legacy DB rows that pre-date migration 016 backfill.
  insight: {
    key: 'insight',
    label: '洞察 (旧)',
    tintClass: 'text-byline-product',
    icon: Lightbulb,
    sortOrder: 2,
    description: '【已弃用 P14 P2】legacy kind — 新代码用 facet=semantic + category=workspace-fact',
  },
  constraint: {
    key: 'constraint',
    label: '约束 (旧)',
    tintClass: 'text-stratum-danger',
    icon: Lock,
    sortOrder: 3,
    description: '【已弃用 P14 P2】legacy kind — 新代码用 facet=semantic + category=user-constraint',
  },
  preference: {
    key: 'preference',
    label: '偏好 (旧)',
    tintClass: 'text-byline-market',
    icon: Bookmark,
    sortOrder: 4,
    description: '【已弃用 P14 P2】legacy kind — 新代码用 facet=semantic + category=user-preference',
  },
  summary: {
    key: 'summary',
    label: '会话摘要',
    tintClass: 'text-stratum-muted',
    icon: FileText,
    sortOrder: 5,
    description: '对一次会话的浓缩归纳',
  },
  canvas: {
    key: 'canvas',
    label: '画布快照',
    tintClass: 'text-byline-finance',
    icon: LayoutPanelTop,
    sortOrder: 6,
    description: 'BMC 输出 + 节点结构存档',
  },
}

const FALLBACK: MemoryKindDescriptor = {
  key: 'unknown',
  label: '其他',
  tintClass: 'text-stratum-muted',
  icon: Sparkles,
  sortOrder: 99,
  description: '未注册的 memory kind — 保底渲染',
}

/** Resolve an arbitrary kind string to its descriptor (with fallback). */
export function getMemoryKindDescriptor(kind: string): MemoryKindDescriptor {
  return KIND_REGISTRY[kind] ?? { ...FALLBACK, key: kind, label: kind }
}

/** Append or override a kind at runtime (used by plugins). */
export function registerMemoryKind(descriptor: MemoryKindDescriptor): void {
  KIND_REGISTRY[descriptor.key] = descriptor
}

/** Get all registered kinds, sorted by sortOrder. */
export function listRegisteredKinds(): MemoryKindDescriptor[] {
  return Object.values(KIND_REGISTRY).sort((a, b) => a.sortOrder - b.sortOrder)
}
