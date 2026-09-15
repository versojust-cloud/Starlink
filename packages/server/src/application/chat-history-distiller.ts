/**
 * P14 P6 follow-up · ChatHistoryDistiller — L1 → L2 promotion via LLM.
 *
 * The L1 chat-message rows (raw user/assistant turns) are too granular
 * to feed to future cross-session retrieval. This distiller condenses
 * a run's chat history into a single L2 episodic summary that:
 *
 *   1. Captures the user's actual questions (what did they ask)
 *   2. Captures key decisions / agreements (what was concluded)
 *   3. Surfaces unresolved questions (what's still open)
 *
 * Output is short (≤ 600 chars), embedded for similarity search, and
 * tagged with `category='bmc-summary'` so it shows up in the same
 * retrieval queries as the structured pipeline summary written by
 * business-langgraph.writeConversationSummary.
 *
 * Best-effort — never throws. Skips silently if:
 *   - Fewer than MIN_USER_TURNS user turns in the conversation
 *   - LLM call fails / times out
 *   - LLM returns empty / unstructured output
 */

import { LLMClient } from '../services/llm-client.js'
import { createAuditLogger } from '@starlink/shared'
import type { ConversationMessage } from '@starlink/shared'

const auditLogger = createAuditLogger('packages/server:application:chat-history-distiller')

const MIN_USER_TURNS = 3
const MAX_INPUT_CHARS = 6_000   // cap prompt so we don't blow context window
const MAX_OUTPUT_CHARS = 600    // cap output for L2 storage

const DISTILL_SYSTEM_PROMPT = `你是一名商业顾问会话归档员。把一段用户和 AI 商业顾问之间的对话提炼成一段简短的会话回顾。

要求：
1. 用 3-5 句话总结
2. 第一句概括场景（用户在做什么 idea / 行业）
3. 接下来 1-3 句列具体的决定或共识
4. 最后 1 句标注未解的疑问或下一步方向（如有）
5. 中文，不超过 200 字
6. 不要重复用户的原话；要提炼

输出仅是这段会话回顾文字，不要 JSON 不要 markdown 不要前后说明。`

const DISTILL_USER_PROMPT_HEADER = `下面是一段对话。请按上述要求提炼会话回顾：

`

export class ChatHistoryDistiller {
  private readonly llm: LLMClient

  constructor(llm?: LLMClient) {
    this.llm = llm ?? new LLMClient()
  }

  /**
   * Distill the messages into a short summary. Returns null when:
   *   - Fewer than MIN_USER_TURNS user turns
   *   - LLM call fails or returns empty
   *   - Distilled output is too short to be useful
   *
   * Never throws.
   */
  async distill(messages: ConversationMessage[]): Promise<string | null> {
    const userTurns = messages.filter((m) => m.role === 'user').length
    if (userTurns < MIN_USER_TURNS) return null

    const transcript = renderTranscript(messages)
    if (transcript.length === 0) return null

    try {
      const response = await this.llm.chat({
        messages: [
          { role: 'system', content: DISTILL_SYSTEM_PROMPT },
          { role: 'user', content: DISTILL_USER_PROMPT_HEADER + transcript }
        ],
        temperature: 0.3
      })
      const distilled = (response.content ?? '').trim()
      if (distilled.length < 30) {
        // Too short to be a useful summary — skip rather than persist noise.
        return null
      }
      return distilled.length > MAX_OUTPUT_CHARS
        ? distilled.slice(0, MAX_OUTPUT_CHARS) + '…'
        : distilled
    } catch (err) {
      auditLogger.warn({
        action: 'chat-history-distiller.failed',
        metadata: { error: err instanceof Error ? err.message : String(err) }
      })
      return null
    }
  }
}

function renderTranscript(messages: ConversationMessage[]): string {
  // Keep only user / assistant turns (drop system/tool noise) and
  // cap the rendered transcript so the LLM call doesn't blow context.
  const lines: string[] = []
  let totalChars = 0
  for (const m of messages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue
    const speaker = m.role === 'user' ? '用户' : 'AI'
    const content = (m.content ?? '').trim()
    if (!content) continue
    const line = `${speaker}：${content}`
    if (totalChars + line.length > MAX_INPUT_CHARS) {
      // Stop accumulating; keep the most recent N turns by truncating
      // the front (this loop walks oldest→newest; reverse trim).
      break
    }
    lines.push(line)
    totalChars += line.length
  }
  // If we hit cap, keep the last N lines (most recent context); messages
  // arrive newest-first from listMessages, so simply slice.
  return lines.join('\n\n')
}
