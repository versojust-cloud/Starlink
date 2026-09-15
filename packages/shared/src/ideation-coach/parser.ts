/**
 * Parse + validate the LLM's raw chat-completion content into a
 * shaped ReflectionResponse-like object.
 *
 * Both the Next.js REST route and (future) Apollo resolver call this
 * with the raw string they get from their respective LLM client. The
 * parser strips markdown fences, JSON.parse, validates shape.
 *
 * Throws Error on any failure — caller decides whether to fall back
 * to scripted output or surface the error.
 */

import type { ScaffoldKind } from './schemas.js'

export interface ParsedCoachReply {
  scaffold: ScaffoldKind
  content: string
}

const VALID_SCAFFOLDS: readonly ScaffoldKind[] = [
  'why',
  'how',
  'so-what',
  'evidence-needed',
  'meta'
]

/**
 * Parse the LLM-returned chat-completion `content` string into a
 * structurally-valid ParsedCoachReply.
 */
export function parseCoachReply(rawContent: string): ParsedCoachReply {
  const stripped = rawContent
    .trim()
    .replace(/^```(?:json)?\s*/, '')
    .replace(/\s*```$/, '')
  let parsed: unknown
  try {
    parsed = JSON.parse(stripped)
  } catch {
    throw new Error(`Coach LLM output is not valid JSON: ${rawContent.slice(0, 120)}`)
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Coach LLM output is not an object')
  }
  const obj = parsed as { scaffold?: unknown; content?: unknown }
  if (
    typeof obj.scaffold !== 'string' ||
    !VALID_SCAFFOLDS.includes(obj.scaffold as ScaffoldKind) ||
    typeof obj.content !== 'string' ||
    obj.content.length < 8
  ) {
    throw new Error('Coach LLM output failed shape check')
  }
  return {
    scaffold: obj.scaffold as ScaffoldKind,
    content: obj.content.slice(0, 500)
  }
}
