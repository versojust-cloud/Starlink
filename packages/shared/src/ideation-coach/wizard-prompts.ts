/**
 * Wizard-step prompt templates (Wave F.7-pre).
 *
 * Lifted from apps/web/app/api/ideation/wizard-step/route.ts. Both the
 * REST route and (forthcoming) GraphQL resolver consume the same
 * strings, so prompt iteration stays in one place.
 */

import type { IdeationNodeKind } from './schemas.js'
import {
  type WizardStepRequest,
  nextWizardStep
} from './wizard-schemas.js'

/**
 * Wizard system prompt. Same Meflex-philosophy boundaries as the coach,
 * with structured-extraction instructions added (extract a typed node
 * from the user's free-text answer + generate the next contextual
 * question).
 */
export const WIZARD_SYSTEM_PROMPT = `You are a Meflex-style entrepreneurship coach guiding a founder through 7-step ideation. The current step ID is provided; you must:

1. EXTRACT a structured node from the user's free-text answer
   - kind: must match the step's expected kind exactly
   - label: a concise <=24 字 (Chinese) title summarizing the answer
   - content: cleaned-up version of the user's answer, removing filler. DO NOT add new content the user didn't say.

2. GENERATE the next AI question, informed by:
   - the current canvas (nodes already on it)
   - the user's just-given answer
   - the next step in the deterministic order
   - Tone: focused, one question, push for specificity. NEVER write content for them, only ask.
   - Length: 1-3 short paragraphs in 中文 (zh-CN). Markdown *emphasis* allowed.

OUTPUT exactly this JSON shape (nothing else):
{
  "extracted": {
    "kind": "<step's expected kind>",
    "label": "<<=24 chars Chinese>",
    "content": "<cleaned user content>"
  },
  "nextQuestion": "<your next question in Chinese, max 600 chars>"
}

Constraints:
- Do NOT include markdown fences in the JSON
- Do NOT generate content for the user that they didn't say
- The 'kind' MUST match what the step expects; never pick a different kind
- If user's answer is empty/garbage, still extract what you can with a placeholder label like "待补充"`

/**
 * Build the per-step user message.
 */
export function buildWizardUserMessage(
  input: WizardStepRequest,
  expectedKind: IdeationNodeKind
): string {
  const canvasSummary = input.canvas.nodes.length
    ? input.canvas.nodes
        .slice(-12)
        .map(
          (n, i) =>
            `  [${i + 1}] ${n.kind} · "${n.label}"${n.content ? ` — ${n.content.slice(0, 120).replace(/\n+/g, ' ')}` : ''}`
        )
        .join('\n')
    : '  (empty)'
  const chatLines = input.recentChat.length
    ? input.recentChat
        .slice(-6)
        .map(
          (m) =>
            `  ${m.role.toUpperCase()}: ${m.content.slice(0, 200).replace(/\n+/g, ' ')}`
        )
        .join('\n')
    : '  (no prior exchange)'
  const nextStep = nextWizardStep(input.step)
  // Same pattern as buildCoachUserMessage: optional user-skill block,
  // server-fetched, only rendered when non-empty.
  const skillSection = input.userSkillBlock?.trim()
    ? `\n\n## 用户长期画像（仅供你避免重复问已知信息 + 调整下一题难度，不要在回答里复述）\n${input.userSkillBlock.trim()}`
    : ''
  return `CURRENT STEP: ${input.step}
EXPECTED KIND for extraction: ${expectedKind}
NEXT STEP: ${nextStep}

CANVAS (so far):
${canvasSummary}${skillSection}

RECENT EXCHANGE (newest last):
${chatLines}

USER JUST ANSWERED:
${input.userAnswer}

Respond with the JSON object only.`
}
