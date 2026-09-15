import { z } from 'zod'

/**
 * Evidence schema (cell-level citation support).
 *
 * Extension over legacy `knowledgeEvidenceSchema` (conversation.ts) —
 * adds `id` and `snippetId` for stable cross-session reference.
 *
 * Backward-compat:
 *   - `snippetId` is derived from `${docId}-chunk-${metadata.chunkIndex}` when absent.
 *   - Legacy `snippet` field is aliased to `text`.
 */
export const evidenceSchema = z.object({
  id: z.string(),
  docId: z.string(),
  snippetId: z.string(),
  text: z.string(),
  score: z.number(),
  metadata: z
    .object({
      source: z.enum(['file', 'url', 'seed']).optional(),
      chunkIndex: z.number().optional(),
      charStart: z.number().optional(),
      charEnd: z.number().optional(),
      title: z.string().optional()
    })
    .catchall(z.unknown())
    .optional()
})

export const evidenceRefSchema = z.object({
  evidenceId: z.string(),
  docId: z.string(),
  snippetId: z.string()
})

export const citationSpanSchema = z.object({
  textStart: z.number().int().min(0),
  textEnd: z.number().int().min(0),
  refs: z.array(evidenceRefSchema)
})

export const bmcCardFieldSchema = z.enum(['title', 'content', 'summary'])

export const cardCitationSchema = z.object({
  cardId: z.string(),
  fieldName: bmcCardFieldSchema,
  spans: z.array(citationSpanSchema)
})

export const bmcDimensionSchema = z.enum([
  'CUSTOMER_SEGMENTS',
  'VALUE_PROPOSITIONS',
  'CHANNELS',
  'CUSTOMER_RELATIONSHIPS',
  'REVENUE_STREAMS',
  'KEY_RESOURCES',
  'KEY_ACTIVITIES',
  'KEY_PARTNERSHIPS',
  'COST_STRUCTURE'
])

export const noRefRangeSchema = z.object({
  textStart: z.number().int().min(0),
  textEnd: z.number().int().min(0)
})

/**
 * Per-field parse result emitted by the Citation Parser.
 * Used both as in-memory artifact and persistence snapshot.
 */
export const citationParseResultSchema = z.object({
  cleanText: z.string(),
  spans: z.array(citationSpanSchema),
  noRefRanges: z.array(noRefRangeSchema),
  invalidRefs: z.array(
    z.object({
      docId: z.string(),
      snippetId: z.string()
    })
  )
})

export type Evidence = z.infer<typeof evidenceSchema>
export type EvidenceRef = z.infer<typeof evidenceRefSchema>
export type CitationSpan = z.infer<typeof citationSpanSchema>
export type BmcCardField = z.infer<typeof bmcCardFieldSchema>
export type CardCitation = z.infer<typeof cardCitationSchema>
export type BmcDimension = z.infer<typeof bmcDimensionSchema>
export type NoRefRange = z.infer<typeof noRefRangeSchema>
export type CitationParseResult = z.infer<typeof citationParseResultSchema>

/**
 * Derive a stable snippetId from legacy evidence that lacks one.
 *
 * snippetId is scoped to the document (does NOT include docId); global
 * uniqueness is achieved via the (docId, snippetId) pair, mirrored in
 * `Evidence.id = ${docId}-${snippetId}`.
 *
 * Uses metadata.chunkIndex when present, otherwise a deterministic hash of
 * the snippet text.
 */
export function deriveSnippetId(
  docId: string,
  metadata: { chunkIndex?: number } | undefined,
  textFallback: string
): string {
  if (metadata && typeof metadata.chunkIndex === 'number') {
    return `chunk-${metadata.chunkIndex}`
  }
  let hash = 0
  for (let i = 0; i < textFallback.length; i++) {
    hash = ((hash << 5) - hash + textFallback.charCodeAt(i)) | 0
  }
  return `h${Math.abs(hash).toString(36)}`
}
