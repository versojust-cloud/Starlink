/**
 * Synthetic conversation-summary generator (2026-04-28).
 *
 * Given a `BenchmarkPersona` + one of their `ideaWorkspaces`, asks the LLM
 * to produce a plausible one-paragraph summary of "what happened in a
 * BMC ideation session for this idea". The summary is what the real
 * `writeConversationSummary` would have produced if a human persona had
 * actually run the wizard / reflection loop on this idea.
 *
 * Why synthetic + not full wizard run: keeps the experiment focused on
 * the extractor + read pipeline, not the wizard or coach. Full end-to-end
 * is a follow-up.
 *
 * The LLM is told to make persona traits SHOW UP in the summary
 * implicitly — through which BMC dimensions get attention vs neglected,
 * which questions the user asked, which assumptions they made — rather
 * than stating "this user is a B2B PM" outright. This mirrors how real
 * `writeConversationSummary` writes facts like "用户问到了分销渠道",
 * "假设了支付意愿但未验证", etc.
 */

import { LLMClient } from '../../services/llm-client.js'
import type { BenchmarkPersona } from './personas.js'

export interface SyntheticSummary {
  traceId: string
  workspaceId: string
  ideaName: string
  summary: string
  createdAt: string
}

const SYSTEM_PROMPT = `You generate plausible conversation summaries for a BMC ideation session.

Style: 1 paragraph in 中文, 80-160 字符. Mention concrete BMC details
(client segments, channels, revenue, costs). REVEAL the user's traits
implicitly — through what they asked, what they assumed, what they
neglected — NOT by stating the trait directly. Example:

  GOOD: "用户描述了 SMB SaaS 客户细分 + 销售漏斗，但绕过了定价讨论；
         多次引用 Salesforce 案例。"
  BAD:  "用户是 5 年 B2B PM 出身，不爱谈定价。"

Output: bare 中文 paragraph, NO json, NO markdown, NO meta-commentary.`

function buildUserMessage(persona: BenchmarkPersona, idea: BenchmarkPersona['ideaWorkspaces'][number], sessionIndex: number): string {
  const traitHints = persona.traits
    .map((t) => `- ${t.category}: ${t.description}`)
    .join('\n')
  return `PERSONA (these traits should show up implicitly in the summary):
${traitHints}

PERSONA BIO (background, do not quote):
${persona.bio}

THIS IDEATION SESSION (#${sessionIndex + 1}):
- workspace: ${idea.workspaceId}
- idea name: ${idea.ideaName}
- pitch: ${idea.ideaPitch}

Generate a single Chinese paragraph (80-160 字) summarising the session.`
}

/**
 * Generate one synthetic summary per idea workspace for this persona.
 * Falls back to a hand-written stub on LLM failure so the rest of the
 * eval can proceed and the report shows the failure clearly.
 */
export async function generateSyntheticSummaries(
  persona: BenchmarkPersona,
  llm = new LLMClient()
): Promise<SyntheticSummary[]> {
  const results: SyntheticSummary[] = []
  for (const [i, idea] of persona.ideaWorkspaces.entries()) {
    const traceId = `bench-coaching-${persona.id}-${i}-${Date.now()}`
    const userMessage = buildUserMessage(persona, idea, i)
    let summary = `[stub] ${persona.name} 在 ${idea.ideaName} workspace 跑了一次 BMC ideation session。`
    try {
      const resp = await llm.chat({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.7,
        maxTokens: 350
      })
      const content = resp.content?.trim() ?? ''
      if (content && content.length > 20) {
        summary = content
      }
    } catch (err) {
      summary = `[stub:llm-failed:${err instanceof Error ? err.message : String(err)}] ` + summary
    }
    results.push({
      traceId,
      workspaceId: idea.workspaceId,
      ideaName: idea.ideaName,
      summary,
      createdAt: new Date(Date.now() - (persona.ideaWorkspaces.length - i) * 60_000).toISOString()
    })
  }
  return results
}
