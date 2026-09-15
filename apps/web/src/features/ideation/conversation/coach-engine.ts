/**
 * Coach Engine — Mode 1 (reactive scaffolding, Meflex-style).
 *
 * Listens to canvas events and emits AI reflection prompts WITHOUT taking
 * over content creation. Per Meflex (Luo et al. 2026) the LLM is positioned
 * as a "scaffolder of reflection, not a generator of content" — so this
 * engine ONLY produces questions for the chat sidebar; it never auto-creates
 * canvas nodes.
 *
 * Stage A: scripted prompts keyed by node-kind + context. Stage C swaps in
 * a real LLM call. Interface kept narrow:
 *
 *   type CoachEvent = NodeAdded | NodeEdited | NodeLinked | MetaCheck
 *   type Reflection = { content: string; scaffold: ScaffoldKind }
 *
 *   reflectOn(event, currentCanvas) -> Reflection | null
 *
 * Returning `null` means "no comment" — coach stays silent rather than spam
 * the user with a prompt for every micro-edit.
 */

import type { IdeationNodeKind } from '../types/ideation-types'

export type ScaffoldKind = 'why' | 'how' | 'so-what' | 'evidence-needed' | 'meta'

export type CoachEvent =
  | { type: 'node-added'; kind: IdeationNodeKind; label: string }
  | { type: 'node-edited'; kind: IdeationNodeKind; label: string; content: string }
  | { type: 'node-linked'; fromKind: IdeationNodeKind; toKind: IdeationNodeKind }
  | { type: 'meta-check'; canvasSnapshot: CanvasSnapshot }
  /** User explicitly clicked "Reflect Now" — bypass dedup, always emit. */
  | { type: 'manual-reflect'; canvasSnapshot: CanvasSnapshot }

export interface CanvasSnapshot {
  nodeCountByKind: Partial<Record<IdeationNodeKind, number>>
  totalNodes: number
  totalLinks: number
}

export interface Reflection {
  content: string
  scaffold: ScaffoldKind
}

// =============================================================================
// Per-kind reflection prompts.
//
// Each kind has 2-3 alternatives so the coach feels less robotic. The engine
// rotates between them by node-instance count (e.g. the 1st CustomerPain
// node gets prompt[0], the 2nd gets prompt[1], etc).
// =============================================================================

const KIND_PROMPTS: Record<IdeationNodeKind, readonly { content: string; scaffold: ScaffoldKind }[]> = {
  'core-idea': [
    {
      content:
        '看到你的核心想法了 ✦\n\n这个想法**解决谁的问题**？什么时候 / 在什么场景下他们会想到要用？',
      scaffold: 'why'
    }
  ],
  'customer-pain': [
    {
      content:
        '你描述的这个痛点 —— 你是**怎么知道**的？是亲自访谈过、读过文献、还是直觉？\n\n（如果是直觉，建议加一个"证据"节点跑去验证。）',
      scaffold: 'evidence-needed'
    },
    {
      content:
        '这个痛点**多频繁**？多严重？\n\n频繁+严重 = 真痛点；偶尔+轻微 = 可有可无（用户不会真为此付钱）。',
      scaffold: 'why'
    }
  ],
  'value-angle': [
    {
      content:
        '你说的这个价值角度 —— **客户能立刻感受到吗**？\n\n好的价值差异化要么是 10x 量级（不是 10%），要么是客户当场能 demo 看到的。',
      scaffold: 'so-what'
    },
    {
      content:
        '为什么是**你来做**？\n\n这个角度别人也能做吗？你有什么 unfair advantage（数据、关系、专业）？',
      scaffold: 'why'
    }
  ],
  hypothesis: [
    {
      content:
        '看了你的假设。检查一下**可证伪性**：\n\n· 它是不是具体到能用一个简单实验测真假？\n· 失败的样子是什么？（如果"无论结果如何都说成功"，假设就是没用的）',
      scaffold: 'evidence-needed'
    },
    {
      content:
        '这条假设你打算**怎么 cheap 验证**？\n\n100 块、1 周内能测出真假吗？太贵或太慢的假设，常常意味着你描述得太宽。',
      scaffold: 'how'
    }
  ],
  'validation-channel': [
    {
      content:
        '验证渠道有了 ✓\n\n**最少能告诉你"假设错了"** 的实验是什么？\n（这比"假设对了"更重要 —— 创业者通常自我安慰。）',
      scaffold: 'evidence-needed'
    }
  ],
  revenue: [
    {
      content:
        '收入流 ✓\n\n**单位经济学**：一个客户给你 $X，获取这个客户花 $Y，X / Y 是多少？\n\n（早期 X/Y < 3 通常是不健康的。）',
      scaffold: 'how'
    },
    {
      content:
        '客户**为什么愿意付**这个数字？是参考了竞品价格、用户访谈说的、还是你拍脑袋估的？',
      scaffold: 'evidence-needed'
    }
  ],
  risk: [
    {
      content:
        '记下这个风险 ⚠\n\n它是**致命的**还是**头疼的**？\n· 致命 = 想法直接死（如政策禁止、市场不存在）\n· 头疼 = 影响速度但不影响存在\n\n致命风险要先验证。',
      scaffold: 'so-what'
    }
  ],
  evidence: [
    {
      content:
        '加了一手证据，很好 ◈\n\n**数据点是支持还是反驳**最近的某个假设？\n如果是反驳，可能要把那个假设状态改成"证伪"。',
      scaffold: 'so-what'
    }
  ],
  reflection: [
    // Reflections themselves don't trigger more reflections (would loop).
  ]
}

// =============================================================================
// Meta-reflection: triggers when canvas reaches certain milestones.
// =============================================================================

interface MetaTrigger {
  /** function returning true if this meta-prompt should fire for the snapshot */
  shouldFire(snap: CanvasSnapshot, alreadyFired: Set<string>): boolean
  /** unique id so we don't fire the same meta prompt twice */
  id: string
  prompt: Reflection
}

const META_TRIGGERS: MetaTrigger[] = [
  {
    id: 'first-3-nodes',
    shouldFire: (snap, fired) => snap.totalNodes >= 3 && !fired.has('first-3-nodes'),
    prompt: {
      content:
        '你已经画了 3 个节点了 — meta 反思一下：\n\n你的画布**当前像金字塔尖**还是**像一团乱麻**？\n好的早期画布通常聚焦在 1 个核心想法 + 2-3 个紧密相关的节点。如果在多个想法之间跳，建议先选一个深挖。',
      scaffold: 'meta'
    }
  },
  {
    id: 'no-evidence',
    shouldFire: (snap, fired) =>
      snap.totalNodes >= 4 &&
      (snap.nodeCountByKind['evidence'] ?? 0) === 0 &&
      !fired.has('no-evidence'),
    prompt: {
      content:
        '观察：你的画布有 4+ 节点，但**没有 1 个证据节点** ◈\n\n意思是当前所有内容都是你的"想"，没有外部世界的"实"。\n建议挑 1 个最关键的假设，加 1 个证据节点（一手访谈 / 数据 / 文献）。',
      scaffold: 'evidence-needed'
    }
  },
  {
    id: 'no-revenue',
    shouldFire: (snap, fired) =>
      snap.totalNodes >= 5 &&
      (snap.nodeCountByKind['revenue'] ?? 0) === 0 &&
      !fired.has('no-revenue'),
    prompt: {
      content:
        '观察：你画了 5+ 节点，但**还没碰商业模式**（收入流为 0）。\n\n创业者常常喜欢谈产品、回避谈钱。但价值如果不能换成 $，长期会饿死。建议加一个"收入流"节点试着回答：谁付？付多少？',
      scaffold: 'meta'
    }
  },
  {
    id: 'no-risk',
    shouldFire: (snap, fired) =>
      snap.totalNodes >= 6 &&
      (snap.nodeCountByKind['risk'] ?? 0) === 0 &&
      !fired.has('no-risk'),
    prompt: {
      content:
        '观察：6+ 节点了，**但没列任何风险**。\n\n这通常是"创业者陷入自己的 narrative"信号。\n试着写下：什么会让这个想法 1 年内失败？写出来不会让它发生，但**没写出来不代表它不会发生**。',
      scaffold: 'meta'
    }
  }
]

// =============================================================================
// Public API
// =============================================================================

/**
 * Compute the next reflection in response to a canvas event.
 *
 * State: `firedMetaIds` tracks which meta-prompts have already been shown
 * (the engine keeps these in the chat-store; coach is otherwise stateless).
 *
 * Returns null when no reflection should be emitted.
 */
export function reflectOn(
  event: CoachEvent,
  firedMetaIds: Set<string>,
  /** how many reflections this kind has already emitted (used for prompt rotation) */
  perKindReflectionCount: Partial<Record<IdeationNodeKind, number>>
): Reflection | null {
  // User explicitly asked for a reflection — always emit, never dedup.
  // Try meta triggers first (they're the most context-aware); if none fire,
  // return a generic "look at the whole canvas" prompt.
  if (event.type === 'manual-reflect') {
    for (const trigger of META_TRIGGERS) {
      if (trigger.shouldFire(event.canvasSnapshot, firedMetaIds)) {
        firedMetaIds.add(trigger.id)
        return trigger.prompt
      }
    }
    return {
      content:
        '退一步看你的画布 —\n\n· **当前最弱的环节**是哪个节点？为什么？\n· 哪一条假设你**最不确定**？怎么 cheap 验证它？\n· 如果只能保留 3 个节点，你会保留哪 3 个？\n\n挑一个回答试试。',
      scaffold: 'meta'
    }
  }

  if (event.type === 'meta-check') {
    for (const trigger of META_TRIGGERS) {
      if (trigger.shouldFire(event.canvasSnapshot, firedMetaIds)) {
        firedMetaIds.add(trigger.id)
        return trigger.prompt
      }
    }
    return null
  }

  if (event.type === 'node-added') {
    const prompts = KIND_PROMPTS[event.kind] ?? []
    if (prompts.length === 0) return null
    const idx = (perKindReflectionCount[event.kind] ?? 0) % prompts.length
    return prompts[idx] ?? null
  }

  // Node edits don't currently trigger fresh reflection — too noisy. Stage C
  // can use semantic diffs to decide if an edit warrants a follow-up question.
  if (event.type === 'node-edited') return null

  // Linking: simple opinionated prompt
  if (event.type === 'node-linked') {
    return {
      content: `你把 **${event.fromKind}** 连到 **${event.toKind}** —— 你认为前者**导致 / 推动 / 支撑**后者吗？\n\n关系的方向和强度有时候比节点本身更重要，记得在节点里写清楚 why。`,
      scaffold: 'why'
    }
  }

  return null
}

/** Initial greeting on canvas mount (no events yet). */
export function getCoachGreeting(): Reflection {
  return {
    content:
      '我是 Starlink 的反思教练 🌟\n\n你可以从左侧拖节点上画布，或者点 "启动引导" 让我一步步带你走完 7 个核心问题。\n\n每加一个节点，我会问一个反思问题 —— 你不必每个都答，但好的回答能让画布更立体。',
    scaffold: 'meta'
  }
}
