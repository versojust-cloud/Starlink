/**
 * Ideation Conversation Engine — Stage A (scripted, no backend).
 *
 * Models the AI as an entrepreneurship coach that walks the user through a
 * scaffolded ideation flow inspired by Meflex (Luo et al. 2026):
 *
 *   1. Capture the core idea
 *   2. Probe the customer pain (who? where? how often?)
 *   3. Surface the value angle (why you / what differentiator?)
 *   4. Crystallize a falsifiable hypothesis
 *   5. Plan a cheap validation channel
 *   6. Sketch the revenue model
 *   7. Surface main risks
 *   8. Reflect on coverage gaps (meta)
 *
 * Each step exposes:
 *   - the AI question (shown in chat)
 *   - a `commit(answer)` function returning a list of canvas mutations
 *     (add nodes, update label/content, link nodes)
 *
 * Stage C will swap this for a real LLM call. The interface is kept narrow
 * (string in → mutations out + next question) so that swap is local.
 */

import type { IdeationNodeKind } from '../types/ideation-types'

export type StepId =
  | 'core-idea'
  | 'customer-pain'
  | 'value-angle'
  | 'hypothesis'
  | 'validation'
  | 'revenue'
  | 'risk'
  | 'meta'
  | 'done'

export interface NodeAddMutation {
  type: 'add-node'
  kind: IdeationNodeKind
  label: string
  content: string
  /** id of step-owner so the engine can link follow-ups to the same chain */
  trace: StepId
}

export interface NodeLinkMutation {
  type: 'link'
  /** trace ids of the two nodes to connect; engine resolves to actual ids */
  fromTrace: StepId
  toTrace: StepId
}

export type CanvasMutation = NodeAddMutation | NodeLinkMutation

export interface CommitResult {
  mutations: CanvasMutation[]
  /** Next AI message to display in chat. */
  nextAiMessage: string
  /** Next step id, or 'done' when loop finishes. */
  nextStep: StepId
}

interface StepDescriptor {
  id: StepId
  /** AI message displayed BEFORE the user types their answer for this step. */
  question: string
  /** Build canvas mutations from the user's answer. */
  commit(answer: string): CanvasMutation[]
  /** Step that runs after this one's answer is committed. */
  next: StepId
}

const STEPS: StepDescriptor[] = [
  {
    id: 'core-idea',
    question:
      '欢迎来到创业想法画布。我会通过几个问题帮你把想法画出来。\n\n**第一个问题**：用一句话告诉我，你的核心想法是什么？\n（比如："AI 帮普通人做法律咨询"）',
    commit: (answer) => [
      {
        type: 'add-node',
        kind: 'core-idea',
        label: trimToTitle(answer, 24),
        content: answer,
        trace: 'core-idea'
      }
    ],
    next: 'customer-pain'
  },
  {
    id: 'customer-pain',
    question:
      '好，我先把它放到画布中央了 ⭐\n\n**第二个问题**：这个想法解决的是**谁**的什么痛点？\n描述一下具体场景：他们什么时候会卡住？这个痛多频繁？多严重？',
    commit: (answer) => [
      {
        type: 'add-node',
        kind: 'customer-pain',
        label: '客户痛点',
        content: answer,
        trace: 'customer-pain'
      },
      { type: 'link', fromTrace: 'core-idea', toTrace: 'customer-pain' }
    ],
    next: 'value-angle'
  },
  {
    id: 'value-angle',
    question:
      '记下来了 — 客户痛点已挂在核心想法下。\n\n**第三个问题**：你的方案对客户的核心价值是什么？为什么是**你**而不是别人来做这件事？\n（关键差异化点：更便宜？更快？更准？更懂他们？）',
    commit: (answer) => [
      {
        type: 'add-node',
        kind: 'value-angle',
        label: '价值角度',
        content: answer,
        trace: 'value-angle'
      },
      { type: 'link', fromTrace: 'core-idea', toTrace: 'value-angle' }
    ],
    next: 'hypothesis'
  },
  {
    id: 'hypothesis',
    question:
      '价值角度就位 ✓\n\n**第四个问题**：你能把这个想法变成一条**可证伪**的具体假设吗？\n格式："X 类用户在 Y 情境下，会愿意为 Z 付 W 元。"\n（这是创业最关键的一步 — 模糊的想法很难验证，具体的假设可以一周内 cheap 测出真假）',
    commit: (answer) => [
      {
        type: 'add-node',
        kind: 'hypothesis',
        label: '关键假设',
        content: answer,
        trace: 'hypothesis'
      },
      { type: 'link', fromTrace: 'value-angle', toTrace: 'hypothesis' }
    ],
    next: 'validation'
  },
  {
    id: 'validation',
    question:
      '已挂上 — 这条假设接下来要被验证。\n\n**第五个问题**：你打算用什么方式 cheap 验证它？\n常见方式：用户访谈 / 落地页测试 / MVP 实验 / 桌面调研。\n再加上：大概要花多少时间？多少钱？',
    commit: (answer) => [
      {
        type: 'add-node',
        kind: 'validation-channel',
        label: '验证渠道',
        content: answer,
        trace: 'validation'
      },
      { type: 'link', fromTrace: 'hypothesis', toTrace: 'validation' }
    ],
    next: 'revenue'
  },
  {
    id: 'revenue',
    question:
      '验证路径有了 ✓\n\n**第六个问题**：商业模式上 — 你打算怎么收钱？谁付钱？付多少？\n（订阅？交易抽成？授权？广告？服务？）',
    commit: (answer) => [
      {
        type: 'add-node',
        kind: 'revenue',
        label: '收入流',
        content: answer,
        trace: 'revenue'
      },
      { type: 'link', fromTrace: 'core-idea', toTrace: 'revenue' }
    ],
    next: 'risk'
  },
  {
    id: 'risk',
    question:
      '收入假设记下了。\n\n**第七个问题**：什么会让这个想法走不下去？\n（市场？技术？合规？团队？财务？）想到一个最大的风险就行。',
    commit: (answer) => [
      {
        type: 'add-node',
        kind: 'risk',
        label: '主要风险',
        content: answer,
        trace: 'risk'
      },
      { type: 'link', fromTrace: 'core-idea', toTrace: 'risk' }
    ],
    next: 'meta'
  },
  {
    id: 'meta',
    question:
      '好的，我把目前所有的节点综合复盘一下：\n\n你已经有了 — 核心想法 / 客户痛点 / 价值角度 / 关键假设 / 验证渠道 / 收入流 / 风险。\n\n**Meta 反思**：你的画布当前**结构上可能缺**：\n· 一手证据（访谈记录、数据）\n· 竞品 / 替代方案分析\n· 团队 / 资源盘点\n\n要不要继续加？或者你想再调整某个节点？输入"调整 + 节点名"或"加证据"。',
    commit: (answer) => {
      // Lazy: drop a Reflection node carrying the user's reply for the
      // record. Real engine (Stage C) parses the reply and routes accordingly.
      return [
        {
          type: 'add-node',
          kind: 'reflection',
          label: 'Meta 综合',
          content: answer,
          trace: 'meta'
        }
      ]
    },
    next: 'done'
  }
]

const STEP_BY_ID: Record<StepId, StepDescriptor | undefined> = STEPS.reduce(
  (acc, step) => {
    acc[step.id] = step
    return acc
  },
  {} as Record<StepId, StepDescriptor | undefined>
)

/** Initial AI greeting — return before any user input. */
export function getInitialQuestion(): { step: StepId; message: string } {
  return { step: 'core-idea', message: STEPS[0].question }
}

/**
 * Process the user's answer to the current step.
 *
 * Returns canvas mutations + the AI's next message + the next step id.
 * Caller (chat panel) is responsible for applying mutations to the store
 * and rendering `nextAiMessage` in the chat history.
 */
export function commit(stepId: StepId, answer: string): CommitResult {
  const step = STEP_BY_ID[stepId]
  if (!step) {
    return {
      mutations: [],
      nextAiMessage: '对话已结束。开始新一轮请刷新页面。',
      nextStep: 'done'
    }
  }
  const mutations = step.commit(answer)
  const nextStep = step.next
  const nextDescriptor = STEP_BY_ID[nextStep]
  return {
    mutations,
    nextAiMessage:
      nextDescriptor?.question ??
      '太好了 — 第一轮已经画完。接下来可以进入 BMC 视图把节点映射到 9 维上看缺口，或者继续打磨某个节点。',
    nextStep
  }
}

/** Total number of guided steps (for progress UI). */
export const TOTAL_STEPS = STEPS.length

/** 0-based index of a step (for progress UI). */
export function stepIndex(stepId: StepId): number {
  if (stepId === 'done') return TOTAL_STEPS
  return STEPS.findIndex((s) => s.id === stepId)
}

function trimToTitle(text: string, max: number): string {
  const trimmed = text.trim().split('\n')[0]
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}
