/**
 * Ideation Coach service (Wave F.6 + F.7).
 *
 * Server-side caller of the DeepSeek-backed Ideation coach + wizard.
 * Same DeepSeek invocation pattern as the apps/web Next.js routes,
 * but consumed by the GraphQL resolver. Both surfaces share the same
 * prompt + schema via `@starlink/shared/ideation-coach`.
 *
 * On failure (no key, network, parse), falls back to a scripted reply
 * so the GraphQL mutation never throws unrelated errors back at the
 * client. Source-of-output is reported in the response.
 */

import {
  COACH_SYSTEM_PROMPT,
  buildCoachUserMessage,
  parseCoachReply,
  type ReflectionRequest,
  type ReflectionResponse,
  type ScaffoldKind,
  WIZARD_SYSTEM_PROMPT,
  buildWizardUserMessage,
  parseWizardReply,
  type WizardStepRequest,
  type WizardStepResponse,
  type WizardStepId,
  type IdeationNodeKind,
  WIZARD_STEP_TO_KIND,
  nextWizardStep
} from '@starlink/shared'

const DEEPSEEK_URL =
  process.env.DEEPSEEK_BASE_URL?.replace(/\/+$/, '') ?? 'https://api.deepseek.com/v1'
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY ?? process.env.LLM_API_KEY ?? ''
const DEEPSEEK_MODEL = process.env.LLM_MODEL ?? 'deepseek-chat'
const TIMEOUT_MS = 12_000

interface DeepSeekChoice {
  message?: { content?: string | null }
}
interface DeepSeekResp {
  choices?: DeepSeekChoice[]
  error?: { message?: string }
}

async function callDeepSeek<T>(
  systemPrompt: string,
  userPrompt: string,
  parser: (raw: string) => T,
  options: { temperature?: number; maxTokens?: number } = {}
): Promise<T> {
  if (!DEEPSEEK_KEY) {
    throw new Error('DEEPSEEK_API_KEY (or LLM_API_KEY) not configured')
  }
  const ac = new AbortController()
  const timeoutId = setTimeout(() => ac.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${DEEPSEEK_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_KEY}`
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 400
      }),
      signal: ac.signal
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`DeepSeek HTTP ${res.status}: ${text.slice(0, 200)}`)
    }
    const json = (await res.json()) as DeepSeekResp
    if (json.error) throw new Error(`DeepSeek error: ${json.error.message ?? 'unknown'}`)
    const content = json.choices?.[0]?.message?.content?.trim()
    if (!content) throw new Error('DeepSeek returned empty content')
    return parser(content)
  } finally {
    clearTimeout(timeoutId)
  }
}

// =============================================================================
// Coach reflection
// =============================================================================

/**
 * Fallback when the coach LLM call fails (network error / timeout / parse).
 *
 * Each branch:
 *   - References the actual event payload (node label / from-to kinds) so
 *     the reply is at least anchored to what just happened, not a generic
 *     "已有节点的关系".
 *   - Tells the user the AI is in degraded mode so they know the response
 *     is scripted (not blamed on LLM quality).
 *   - Suggests a concrete next action they can take without LLM help.
 *
 * Source field stays 'error' so the chat dock bubble can render a
 * "重试" affordance and a warning tint.
 */
export function reflectionFallback(
  request: ReflectionRequest,
  latencyMs: number
): ReflectionResponse {
  const banner = '_(AI 教练暂时不可达，以下是脚本回复。点 重试 可再试一次。)_\n\n'
  const event = request.event
  let scaffold: ScaffoldKind = 'why'
  let body: string

  switch (event.type) {
    case 'node-added': {
      scaffold = 'why'
      const label = (event.label ?? '').trim().slice(0, 40)
      const kind = event.kind
      body = label
        ? `刚加了 "${label}" (${kind})。用一句话说说：为什么是这个，而不是其他类似选项？`
        : `刚加了一个 ${kind} 节点。用一句话说说为什么是这个，而不是其他类似选项？`
      break
    }
    case 'node-linked': {
      scaffold = 'why'
      body = `你把 ${event.fromKind} → ${event.toKind} 连起来了。这条连线代表 "导致" / "支撑" / "包含" 中哪一种？`
      break
    }
    case 'meta-check': {
      scaffold = 'meta'
      const counts = Object.entries(request.canvas?.nodeCountByKind ?? {})
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k}=${n}`)
        .join(', ')
      body = counts
        ? `当前画布: ${counts}。退一步看：哪个维度最不确定 / 最需要补证据？`
        : '退一步看你的画布：当前最薄弱的环节是什么？哪个节点你最不确定？'
      break
    }
    case 'user-message': {
      scaffold = 'why'
      const said = (event.label ?? '').trim().slice(0, 60)
      body = said
        ? `你刚说："${said}"。能再具体一点吗 — 这是基于什么观察 / 数据 / 经历？`
        : '你刚发了一条消息，但 AI 教练暂时无法理解上下文。能用一句话再说一次你的核心问题吗？'
      break
    }
    default: {
      scaffold = 'why'
      body = '退一步看你的画布：当前最薄弱的环节是什么？'
    }
  }
  return { scaffold, content: banner + body, source: 'error', latencyMs }
}

/**
 * P10 fix C · cheap string-similarity check for repetition detection.
 * Uses normalized character bigram overlap (Sørensen–Dice on bigrams).
 * Threshold ~0.85 for "essentially the same message".
 */
function isMessageRepeat(a: string, b: string): boolean {
  const na = a.trim().toLowerCase()
  const nb = b.trim().toLowerCase()
  if (!na || !nb) return false
  if (na === nb) return true
  // Quick fail if length diverges too much
  const lenRatio = Math.min(na.length, nb.length) / Math.max(na.length, nb.length)
  if (lenRatio < 0.5) return false
  // Bigram Dice similarity
  const bigrams = (s: string): Set<string> => {
    const out = new Set<string>()
    for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2))
    return out
  }
  const A = bigrams(na)
  const B = bigrams(nb)
  if (A.size === 0 || B.size === 0) return false
  let intersection = 0
  for (const g of A) if (B.has(g)) intersection += 1
  const dice = (2 * intersection) / (A.size + B.size)
  return dice >= 0.85
}

/**
 * Generate one reflection for the GraphQL `reflectOnIdeation` mutation.
 */
export async function reflectOnIdeation(
  request: ReflectionRequest
): Promise<ReflectionResponse> {
  const startedAt = Date.now()

  // P10 fix C · short-circuit on repeated user message. If the user just
  // sent essentially the same thing as their previous turn, the Coach
  // should NOT loop back to the same Socratic question — instead nudge
  // toward graduation. Saves an LLM call AND breaks the WHY/WHY loop.
  if (request.event.type === 'user-message') {
    const lastUserMsg = [...request.recentChat].reverse().find((m) => m.role === 'user')
    if (lastUserMsg && isMessageRepeat(lastUserMsg.content, request.event.label)) {
      return {
        scaffold: 'meta',
        content:
          '我注意到你重复了同一个想法 — 这通常说明你已经讲得足够清楚，需要换个动作了。\n\n' +
          '建议二选一：\n' +
          '- 输入 `/wizard` 走 7 步结构化引导（推荐，每步聚焦一个维度）\n' +
          '- 或者直接说**"开始生成 BMC"**，让 8 个 agent 协同把你的想法拆成 9 个商业维度',
        source: 'scripted',
        latencyMs: Date.now() - startedAt
      }
    }
  }

  try {
    const userPrompt = buildCoachUserMessage(request)
    const reply = await callDeepSeek(
      COACH_SYSTEM_PROMPT,
      userPrompt,
      parseCoachReply,
      { temperature: 0.7, maxTokens: 400 }
    )
    return {
      scaffold: reply.scaffold,
      content: reply.content,
      source: 'llm',
      latencyMs: Date.now() - startedAt
    }
  } catch (err) {
    console.warn('[ideation-coach-service] reflectOnIdeation LLM failed', {
      err: err instanceof Error ? err.message : String(err)
    })
    return reflectionFallback(request, Date.now() - startedAt)
  }
}

// =============================================================================
// Wizard step
// =============================================================================

const WIZARD_FALLBACK_NEXT_Q: Record<string, string> = {
  'core-idea':
    '记下你的核心想法。**第二个问题**：这个想法解决的是**谁**的什么痛点？什么时候 / 在什么场景下他们会卡住？',
  'customer-pain':
    '客户痛点已挂在核心想法下。**第三个问题**：你的方案对客户的核心价值是什么？为什么是**你**而不是别人来做？',
  'value-angle':
    '价值角度就位 ✓\n\n**第四个问题**：把这个想法变成一条**可证伪**的具体假设：X 类用户在 Y 情境下，会愿意为 Z 付 W 元。',
  hypothesis:
    '关键假设记下了。**第五个问题**：用什么方式 cheap 验证它？大概要花多少时间？多少钱？',
  validation:
    '验证路径有了 ✓\n\n**第六个问题**：商业模式上 — 你打算怎么收钱？谁付钱？付多少？',
  revenue:
    '收入假设记下了。**第七个问题**：什么会让这个想法走不下去？想到一个最大的风险就行。',
  risk:
    '所有 7 步问题问完了。**Meta 反思**：你的画布当前**结构上可能缺**：一手证据、竞品分析、团队盘点。要不要继续加？',
  meta: '太好了 — 第一轮已经画完。接下来可以进入 BMC 视图把节点映射到 9 维上看缺口。'
}

function wizardFallback(
  request: WizardStepRequest,
  latencyMs: number
): WizardStepResponse {
  const kind: IdeationNodeKind = WIZARD_STEP_TO_KIND[request.step] ?? 'core-idea'
  const trimmed = request.userAnswer.trim().split('\n')[0]
  const label = trimmed.length > 24 ? `${trimmed.slice(0, 22)}…` : trimmed
  return {
    extracted: { kind, label: label || '未命名', content: request.userAnswer },
    nextQuestion: WIZARD_FALLBACK_NEXT_Q[request.step] ?? '继续描述你的下一个想法。',
    nextStep: nextWizardStep(request.step),
    source: 'error',
    latencyMs
  }
}

/**
 * Process one wizard step for the GraphQL `processIdeationWizardStep`
 * mutation. Force kind to step's expected kind even if LLM hallucinates
 * a different kind.
 */
export async function processIdeationWizardStep(
  request: WizardStepRequest
): Promise<WizardStepResponse> {
  const startedAt = Date.now()

  // Step 'done' short-circuits without an LLM call.
  if (request.step === ('done' as WizardStepId)) {
    return {
      extracted: { kind: 'reflection', label: '已完成', content: request.userAnswer },
      nextQuestion: '✓ 7 步引导已完成。继续在画布上打磨节点。',
      nextStep: 'done',
      source: 'scripted'
    }
  }

  const expectedKind: IdeationNodeKind =
    WIZARD_STEP_TO_KIND[request.step] ?? 'core-idea'
  try {
    const userPrompt = buildWizardUserMessage(request, expectedKind)
    const reply = await callDeepSeek(
      WIZARD_SYSTEM_PROMPT,
      userPrompt,
      parseWizardReply,
      { temperature: 0.6, maxTokens: 600 }
    )
    return {
      extracted: {
        kind: expectedKind, // force — don't trust LLM hallucination
        label: reply.extracted.label || '未命名',
        content: reply.extracted.content || request.userAnswer
      },
      nextQuestion: reply.nextQuestion,
      nextStep: nextWizardStep(request.step),
      source: 'llm',
      latencyMs: Date.now() - startedAt
    }
  } catch (err) {
    console.warn('[ideation-coach-service] processIdeationWizardStep LLM failed', {
      err: err instanceof Error ? err.message : String(err)
    })
    return wizardFallback(request, Date.now() - startedAt)
  }
}
