import { NextResponse } from 'next/server'
import {
  ReflectionRequestSchema,
  ReflectionResponseSchema,
  type ReflectionRequest,
  type ReflectionResponse,
  type ScaffoldKind,
  COACH_SYSTEM_PROMPT,
  buildCoachUserMessage,
  parseCoachReply
} from '@starlink/shared'

/**
 * POST /api/ideation/reflect
 *
 * Stage B Coach endpoint — generates a Meflex-style reflection prompt from a
 * canvas snapshot using DeepSeek (chosen for: cost, OpenAI-compatible API,
 * already proven in benchmark runs).
 *
 * Design notes:
 *  - Direct fetch to DeepSeek's OpenAI-compatible endpoint, no SDK. Keeps the
 *    Next.js bundle small and avoids langchain/openai client transitive deps
 *    in the web package.
 *  - JSON mode (`response_format: { type: 'json_object' }`) + Zod parse for
 *    structural safety. If parse fails we fall back to scripted output.
 *  - Hard 12 s server-side timeout via AbortController; matches the frontend
 *    orchestrator's expectation.
 *  - On any LLM failure (env missing, network, 4xx, parse) we return a 200
 *    response with `source: 'error'` and a graceful Chinese message — the
 *    frontend orchestrator falls back to its scripted prompt set.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEEPSEEK_URL =
  process.env.DEEPSEEK_BASE_URL?.replace(/\/+$/, '') ?? 'https://api.deepseek.com/v1'
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY ?? process.env.LLM_API_KEY ?? ''
const DEEPSEEK_MODEL = process.env.LLM_MODEL ?? 'deepseek-chat'
const TIMEOUT_MS = 12_000

// =============================================================================
// Prompt + parser are now in `@starlink/shared/ideation-coach` (Wave F).
// COACH_SYSTEM_PROMPT, buildCoachUserMessage, parseCoachReply imported above.
// =============================================================================
// Fallback (graceful degradation when LLM is unavailable)
// =============================================================================

/**
 * Server-side fallback when the coach LLM call fails (timeout / 5xx).
 *
 * Kept in sync with the canonical fallback in
 * `packages/server/src/services/ideation-coach-service.ts` — both
 * surface a degraded-mode banner + an event-anchored body so users
 * don't see a generic "已有节点的关系" template that ignores context.
 */
function fallbackReflection(input: ReflectionRequest, latencyMs: number): ReflectionResponse {
  const banner = '_(AI 教练暂时不可达，以下是脚本回复。点 重试 可再试一次。)_\n\n'
  const event = input.event
  let scaffold: ScaffoldKind = 'why'
  let body: string
  switch (event.type) {
    case 'node-added': {
      const label = (event.label ?? '').trim().slice(0, 40)
      body = label
        ? `刚加了 "${label}" (${event.kind})。用一句话说说：为什么是这个，而不是其他类似选项？`
        : `刚加了一个 ${event.kind} 节点。为什么是这个？`
      break
    }
    case 'node-linked': {
      body = `你把 ${event.fromKind} → ${event.toKind} 连起来了。这条连线代表 "导致" / "支撑" / "包含" 中哪一种？`
      break
    }
    case 'meta-check': {
      scaffold = 'meta'
      const counts = Object.entries(input.canvas?.nodeCountByKind ?? {})
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k}=${n}`)
        .join(', ')
      body = counts
        ? `当前画布: ${counts}。退一步看：哪个维度最不确定 / 最需要补证据？`
        : '退一步看你的画布：当前最薄弱的环节是什么？'
      break
    }
    default: {
      body = '能再具体一点吗 — 这是基于什么观察 / 数据 / 经历？'
    }
  }
  return { scaffold, content: banner + body, source: 'error', latencyMs }
}

// =============================================================================
// DeepSeek call
// =============================================================================

interface DeepSeekChoice {
  message?: { content?: string | null }
}
interface DeepSeekResp {
  choices?: DeepSeekChoice[]
  error?: { message?: string }
}

async function callDeepSeek(
  systemPrompt: string,
  userPrompt: string,
  signal: AbortSignal
): Promise<{ scaffold: ScaffoldKind; content: string }> {
  if (!DEEPSEEK_KEY) {
    throw new Error('DEEPSEEK_API_KEY (or LLM_API_KEY) not configured')
  }
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
      temperature: 0.7,
      max_tokens: 400
    }),
    signal
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`DeepSeek HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  const json = (await res.json()) as DeepSeekResp
  if (json.error) throw new Error(`DeepSeek error: ${json.error.message ?? 'unknown'}`)
  const content = json.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('DeepSeek returned empty content')

  // Shared parser handles ```json fences + Zod-shape validation.
  return parseCoachReply(content)
}

// =============================================================================
// Route handler
// =============================================================================

export async function POST(request: Request) {
  const startedAt = Date.now()
  let parsedBody: ReflectionRequest
  try {
    const raw = await request.json()
    parsedBody = ReflectionRequestSchema.parse(raw)
  } catch (err) {
    return NextResponse.json(
      {
        error: 'invalid request body',
        detail: err instanceof Error ? err.message : String(err)
      },
      { status: 400 }
    )
  }

  // 12 s timeout
  const ac = new AbortController()
  const timeoutId = setTimeout(() => ac.abort(), TIMEOUT_MS)

  try {
    const userPrompt = buildCoachUserMessage(parsedBody)
    const llm = await callDeepSeek(COACH_SYSTEM_PROMPT, userPrompt, ac.signal)
    clearTimeout(timeoutId)

    const response: ReflectionResponse = {
      scaffold: llm.scaffold,
      content: llm.content,
      source: 'llm',
      latencyMs: Date.now() - startedAt
    }

    // Validate before sending out — also ensures the response shape is stable
    const validated = ReflectionResponseSchema.parse(response)
    return NextResponse.json(validated)
  } catch (err) {
    clearTimeout(timeoutId)
    const latencyMs = Date.now() - startedAt
    const errMsg = err instanceof Error ? err.message : String(err)
    console.warn('[ideation-reflect] LLM call failed, returning fallback', { errMsg, latencyMs })
    const fallback = fallbackReflection(parsedBody, latencyMs)
    return NextResponse.json({ ...fallback, _diagnostic: errMsg })
  }
}
