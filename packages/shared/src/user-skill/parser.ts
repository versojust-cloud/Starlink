/**
 * User-skill extractor reply parser (2026-04-28).
 *
 * Mirrors the ideation-coach parser pattern: strip optional ```json fences,
 * pull the first balanced `{...}` block, Zod-validate against
 * `UserSkillExtractionOutputSchema`. Returns null on any failure.
 *
 * `parseUserSkillExtractionReplyDetailed` returns an object describing
 * what failed (used by the extractor's audit log so failed parses
 * surface the Zod issue list, not just "null"). The cheap variant
 * (returns just the parsed value or null) wraps the detailed one.
 */

import { ZodError } from 'zod'
import {
  UserSkillExtractionOutputSchema,
  UserSkillPayloadSchema,
  UserSkillConsolidationOutputSchema,
  type UserSkillExtractionOutput,
  type UserSkillConsolidationOutput
} from './schemas.js'

export interface ParseResult {
  ok: boolean
  data?: UserSkillExtractionOutput
  /** If !ok: short describing the failure mode. */
  reason?: 'no-json-block' | 'json-syntax' | 'schema-mismatch'
  /** If reason='schema-mismatch': flattened Zod issue list. */
  issues?: Array<{ path: string; message: string }>
  /** Truncated raw input echoed back, for debug. */
  rawPreview?: string
}

export function parseUserSkillExtractionReplyDetailed(raw: string): ParseResult {
  if (!raw) return { ok: false, reason: 'no-json-block', rawPreview: '' }
  const stripped = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
  const match = stripped.match(/\{[\s\S]*\}/)
  if (!match) {
    return { ok: false, reason: 'no-json-block', rawPreview: raw.slice(0, 200) }
  }
  let json: unknown
  try {
    json = JSON.parse(match[0])
  } catch {
    return { ok: false, reason: 'json-syntax', rawPreview: match[0].slice(0, 200) }
  }
  const parsed = UserSkillExtractionOutputSchema.safeParse(json)
  if (parsed.success) return { ok: true, data: parsed.data }

  // Per-item recovery: if the top-level shape is broken because of a bad
  // entry inside `creates` (most common: an over-long title), try to
  // salvage the entries that DO parse. Mirrors the partial-recovery
  // pattern in business-langgraph extractAndParseJSON for BMC nodes.
  const obj = json as Record<string, unknown>
  const recovered: UserSkillExtractionOutput = {
    creates: [],
    updates: [],
    refines: [],
    decays: []
  }
  if (Array.isArray(obj.creates)) {
    for (const c of obj.creates) {
      const r = UserSkillPayloadSchema.safeParse(c)
      if (r.success) recovered.creates.push(r.data)
    }
  }
  if (Array.isArray(obj.updates)) {
    for (const u of obj.updates) {
      if (u && typeof u === 'object' && typeof (u as { id?: unknown }).id === 'string') {
        const updateRow = u as { id: string; confidenceDelta?: number; addEvidence?: string | null }
        recovered.updates.push({
          id: updateRow.id,
          confidenceDelta: typeof updateRow.confidenceDelta === 'number' ? updateRow.confidenceDelta : 0,
          addEvidence: updateRow.addEvidence ?? null
        })
      }
    }
  }
  if (Array.isArray(obj.refines)) {
    for (const f of obj.refines) {
      if (f && typeof f === 'object' && typeof (f as { id?: unknown }).id === 'string') {
        const refRow = f as { id: string; newTitle?: string | null; newContent?: string | null; reason?: string }
        recovered.refines.push({
          id: refRow.id,
          newTitle: refRow.newTitle ?? null,
          newContent: refRow.newContent ?? null,
          reason: refRow.reason ?? 'unspecified'
        })
      }
    }
  }
  if (Array.isArray(obj.decays)) {
    for (const d of obj.decays) {
      if (d && typeof d === 'object' && typeof (d as { id?: unknown }).id === 'string') {
        recovered.decays.push({ id: (d as { id: string }).id })
      }
    }
  }

  const totalRecovered =
    recovered.creates.length +
    recovered.updates.length +
    recovered.refines.length +
    recovered.decays.length
  if (totalRecovered > 0) {
    return { ok: true, data: recovered }
  }

  const err = parsed.error as ZodError
  return {
    ok: false,
    reason: 'schema-mismatch',
    issues: err.errors.slice(0, 8).map((i) => ({
      path: i.path.join('.'),
      message: i.message
    })),
    rawPreview: match[0].slice(0, 300)
  }
}

export function parseUserSkillExtractionReply(
  raw: string
): UserSkillExtractionOutput | null {
  const result = parseUserSkillExtractionReplyDetailed(raw)
  return result.ok ? result.data ?? null : null
}

// ===========================================================================
// Layer-2 consolidation reply parser
// ===========================================================================

/**
 * Detailed parser for `UserSkillConsolidator` LLM reply. Same pattern as the
 * extractor parser: strip fences, balance-match the first JSON block,
 * Zod-validate. Per-item recovery is intentionally NOT applied here —
 * partial consolidation output is dangerous (a half-applied merge would
 * archive sources without creating the merged replacement). All-or-nothing.
 */
export function parseUserSkillConsolidationReplyDetailed(raw: string): {
  ok: boolean
  data?: UserSkillConsolidationOutput
  reason?: 'no-json-block' | 'json-syntax' | 'schema-mismatch'
  issues?: Array<{ path: string; message: string }>
  rawPreview?: string
} {
  if (!raw) return { ok: false, reason: 'no-json-block', rawPreview: '' }
  const stripped = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
  const match = stripped.match(/\{[\s\S]*\}/)
  if (!match) {
    return { ok: false, reason: 'no-json-block', rawPreview: raw.slice(0, 200) }
  }
  let json: unknown
  try {
    json = JSON.parse(match[0])
  } catch {
    return { ok: false, reason: 'json-syntax', rawPreview: match[0].slice(0, 200) }
  }
  const parsed = UserSkillConsolidationOutputSchema.safeParse(json)
  if (parsed.success) return { ok: true, data: parsed.data }
  const err = parsed.error as ZodError
  return {
    ok: false,
    reason: 'schema-mismatch',
    issues: err.errors.slice(0, 8).map((i) => ({
      path: i.path.join('.'),
      message: i.message
    })),
    rawPreview: match[0].slice(0, 300)
  }
}
