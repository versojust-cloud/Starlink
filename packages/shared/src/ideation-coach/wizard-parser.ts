/**
 * Parse + shape-check the LLM's raw chat-completion content for the
 * wizard-step flow. Counterpart of `parseCoachReply` for the wizard.
 *
 * Throws on any failure — caller decides whether to use scripted
 * fallback or surface the error.
 */

import type { IdeationNodeKind } from './schemas.js'

export interface ParsedWizardReply {
  extracted: {
    kind: IdeationNodeKind
    label: string
    content: string
  }
  nextQuestion: string
}

export function parseWizardReply(rawContent: string): ParsedWizardReply {
  const stripped = rawContent
    .trim()
    .replace(/^```(?:json)?\s*/, '')
    .replace(/\s*```$/, '')
  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch {
    throw new Error(`Wizard LLM output is not valid JSON: ${rawContent.slice(0, 120)}`)
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Wizard LLM output is not an object')
  }
  const obj = parsed as {
    extracted?: { kind?: unknown; label?: unknown; content?: unknown }
    nextQuestion?: unknown
  }
  const e = obj.extracted
  if (
    !e ||
    typeof e.kind !== 'string' ||
    typeof e.label !== 'string' ||
    typeof e.content !== 'string' ||
    typeof obj.nextQuestion !== 'string' ||
    obj.nextQuestion.length < 4
  ) {
    throw new Error('Wizard LLM output failed shape check')
  }
  return {
    extracted: {
      kind: e.kind as IdeationNodeKind,
      label: e.label.slice(0, 60),
      content: e.content.slice(0, 800)
    },
    nextQuestion: obj.nextQuestion.slice(0, 700)
  }
}
