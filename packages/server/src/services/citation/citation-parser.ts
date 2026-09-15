/**
 * Citation Parser
 *
 * Parses LLM-generated text with inline citation tokens `[[ref:docId#snippetId]]`
 * and `[[no-ref]]` markers, producing a clean text + structured `CitationSpan[]`
 * aligned to the clean-text character offsets.
 *
 * See docs/architecture-evidence-grounded-bmc.md §6.3 for the algorithm rationale.
 */

import type {
  CitationParseResult,
  CitationSpan,
  Evidence,
  NoRefRange
} from '@starlink/shared'

const CITATION_REGEX = /\[\[ref:([a-zA-Z0-9_-]+)#([a-zA-Z0-9_-]+)\]\]/g
const NOREF_REGEX = /\[\[no-ref\]\]/g

type Token =
  | { kind: 'ref'; start: number; end: number; docId: string; snippetId: string }
  | { kind: 'noref'; start: number; end: number }

/**
 * Parse citation tokens out of raw LLM text.
 *
 * - Valid `[[ref:docId#snippetId]]` tokens become `CitationSpan` entries whose
 *   `[textStart, textEnd)` covers the preceding phrase (bounded by sentence
 *   terminators in clean-text coordinates).
 * - `[[no-ref]]` tokens produce `NoRefRange` entries identifying the
 *   explicitly unsupported phrase.
 * - Refs pointing to unknown `docId#snippetId` are reported in `invalidRefs`
 *   AND downgraded to `NoRefRange` (so UI can still warn the user).
 * - Adjacent spans that share the exact same set of `evidenceId` are merged.
 *
 * The returned `cleanText` has all tokens removed, and all offsets in `spans`
 * / `noRefRanges` refer to positions in `cleanText`.
 */
export function parseCitations(
  rawText: string,
  evidenceSet: Evidence[]
): CitationParseResult {
  const evidenceIndex = new Map<string, Evidence>()
  for (const e of evidenceSet) {
    evidenceIndex.set(`${e.docId}#${e.snippetId}`, e)
  }

  const tokens = collectTokens(rawText)
  tokens.sort((a, b) => a.start - b.start)

  let cleanText = ''
  let lastRawEnd = 0
  const spans: CitationSpan[] = []
  const noRefRanges: NoRefRange[] = []
  const invalidRefs: Array<{ docId: string; snippetId: string }> = []

  for (const token of tokens) {
    const segmentStartInClean = cleanText.length
    const segment = rawText.slice(lastRawEnd, token.start)
    cleanText += segment
    const segmentEnd = cleanText.length
    // Span starts at the LATER of (a) the nearest sentence boundary or (b) the
    // previous token's end. This prevents overlapping when two refs back-to-back
    // have no sentence terminator between them.
    const spanStart = Math.max(
      findPhraseStart(cleanText, segmentEnd),
      segmentStartInClean
    )

    if (token.kind === 'ref') {
      const key = `${token.docId}#${token.snippetId}`
      const evidence = evidenceIndex.get(key)
      if (evidence) {
        spans.push({
          textStart: spanStart,
          textEnd: segmentEnd,
          refs: [
            {
              evidenceId: evidence.id,
              docId: evidence.docId,
              snippetId: evidence.snippetId
            }
          ]
        })
      } else {
        invalidRefs.push({ docId: token.docId, snippetId: token.snippetId })
        noRefRanges.push({ textStart: spanStart, textEnd: segmentEnd })
      }
    } else {
      noRefRanges.push({ textStart: spanStart, textEnd: segmentEnd })
    }

    lastRawEnd = token.end
  }

  cleanText += rawText.slice(lastRawEnd)

  return {
    cleanText,
    spans: mergeAdjacentSpans(spans),
    noRefRanges: mergeAdjacentRanges(noRefRanges),
    invalidRefs
  }
}

/**
 * Grounding Rate: fraction of the clean text covered by at least one citation span.
 * 0..1, where 1 means every character is backed by evidence.
 */
export function computeGroundingRate(result: CitationParseResult): number {
  const totalLength = result.cleanText.length
  if (totalLength === 0) return 0

  const covered = new Uint8Array(totalLength)
  for (const span of result.spans) {
    const start = clampIndex(span.textStart, totalLength)
    const end = clampIndex(span.textEnd, totalLength)
    for (let i = start; i < end; i++) covered[i] = 1
  }

  let coveredCount = 0
  for (let i = 0; i < totalLength; i++) {
    if (covered[i]) coveredCount++
  }
  return coveredCount / totalLength
}

function clampIndex(index: number, length: number): number {
  if (index < 0) return 0
  if (index > length) return length
  return index
}

function collectTokens(rawText: string): Token[] {
  const out: Token[] = []

  for (const m of rawText.matchAll(CITATION_REGEX)) {
    out.push({
      kind: 'ref',
      start: m.index!,
      end: m.index! + m[0].length,
      docId: m[1],
      snippetId: m[2]
    })
  }
  for (const m of rawText.matchAll(NOREF_REGEX)) {
    out.push({
      kind: 'noref',
      start: m.index!,
      end: m.index! + m[0].length
    })
  }

  return out
}

/**
 * Find the phrase start position in clean text.
 *
 * Walks backward from `pos` looking for sentence / clause terminators.
 * Supported boundaries (Chinese + English): 。 ； ！ ？ ! ? ; newline, and
 * start-of-text.
 *
 * Returns the position **after** the boundary, so the span does not include
 * the preceding punctuation.
 */
function findPhraseStart(text: string, pos: number): number {
  for (let i = pos - 1; i >= 0; i--) {
    const ch = text[i]
    if (
      ch === '。' ||
      ch === '；' ||
      ch === '！' ||
      ch === '？' ||
      ch === '!' ||
      ch === '?' ||
      ch === ';' ||
      ch === '\n'
    ) {
      return i + 1
    }
  }
  return 0
}

function mergeAdjacentSpans(spans: CitationSpan[]): CitationSpan[] {
  if (spans.length === 0) return []
  const sorted = [...spans].sort((a, b) => a.textStart - b.textStart)
  const result: CitationSpan[] = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    const prev = result[result.length - 1]
    const cur = sorted[i]
    if (prev.textEnd === cur.textStart && refsEqual(prev.refs, cur.refs)) {
      prev.textEnd = cur.textEnd
    } else {
      result.push(cur)
    }
  }
  return result
}

function mergeAdjacentRanges(ranges: NoRefRange[]): NoRefRange[] {
  if (ranges.length === 0) return []
  const sorted = [...ranges].sort((a, b) => a.textStart - b.textStart)
  const result: NoRefRange[] = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    const prev = result[result.length - 1]
    const cur = sorted[i]
    if (prev.textEnd >= cur.textStart) {
      prev.textEnd = Math.max(prev.textEnd, cur.textEnd)
    } else {
      result.push(cur)
    }
  }
  return result
}

function refsEqual(
  a: CitationSpan['refs'],
  b: CitationSpan['refs']
): boolean {
  if (a.length !== b.length) return false
  const seen = new Set(a.map((r) => r.evidenceId))
  for (const r of b) {
    if (!seen.has(r.evidenceId)) return false
  }
  return true
}
