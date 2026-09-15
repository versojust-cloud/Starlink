'use client'

import { Fragment, useMemo } from 'react'
import { CitationBadge } from './citation-badge'
import { useComfyStore } from '../store'

type EvidenceLike = {
  id?: string
  docId?: string
  snippet?: string
  score?: number
  metadata?: Record<string, unknown>
}

type EvidenceRef = {
  evidenceId: string
  docId: string
  snippetId: string
}

type CitationSpan = {
  textStart: number
  textEnd: number
  refs: EvidenceRef[]
}

type CardCitation = {
  cardId: string
  fieldName: string
  spans: CitationSpan[]
}

type NoRefRange = {
  textStart: number
  textEnd: number
}

type CardFieldWithCitationsProps = {
  cardId: string
  fieldName?: string
  text: string
  noRefRanges?: NoRefRange[]
  className?: string
}

type Segment =
  | { kind: 'text'; start: number; end: number }
  | {
      kind: 'ref'
      start: number
      end: number
      spanIndex: number
      evidence: EvidenceLike | null
      evidenceId: string
      docId: string
    }
  | { kind: 'no-ref'; start: number; end: number }

/**
 * Render a text field interleaved with citation badges and no-ref markers.
 *
 * Takes raw text + positional metadata (CitationSpan[] from store and
 * optional NoRefRange[]) and emits `<text>[badge]<text>` sequences.
 *
 * On badge click: opens the Evidence Drawer focused on that evidence.
 */
export function CardFieldWithCitations({
  cardId,
  fieldName = 'content',
  text,
  noRefRanges,
  className
}: CardFieldWithCitationsProps) {
  const citations = useComfyStore((state) => state.citations[cardId])
  const knowledgeEvidence = useComfyStore((state) => state.knowledgeEvidence)
  const openEvidenceDrawer = useComfyStore((state) => state.openEvidenceDrawer)
  const focusedEvidenceId = useComfyStore(
    (state) => state.evidenceDrawer.focusedEvidenceId
  )
  const isDrawerOpen = useComfyStore((state) => state.evidenceDrawer.isOpen)

  const citation: CardCitation | undefined = useMemo(
    () => citations?.find((c) => c.fieldName === fieldName),
    [citations, fieldName]
  )

  const segments = useMemo(
    () => buildSegments(text, citation?.spans ?? [], noRefRanges ?? [], knowledgeEvidence),
    [text, citation, noRefRanges, knowledgeEvidence]
  )

  if (!citation && (!noRefRanges || noRefRanges.length === 0)) {
    // Fall back to raw text when no citation metadata is available.
    return <span className={className}>{text}</span>
  }

  // Assign [n] indices across valid refs in order.
  let refCounter = 0

  return (
    <span className={className}>
      {segments.map((seg, i) => {
        if (seg.kind === 'text') {
          return <Fragment key={i}>{text.slice(seg.start, seg.end)}</Fragment>
        }
        if (seg.kind === 'ref') {
          refCounter += 1
          const isActive = isDrawerOpen && focusedEvidenceId === seg.evidenceId
          return (
            <Fragment key={i}>
              {text.slice(seg.start, seg.end)}
              <CitationBadge
                variant="ref"
                index={refCounter}
                docId={seg.docId}
                score={seg.evidence?.score}
                active={isActive}
                onClick={() => openEvidenceDrawer(seg.evidenceId, seg.spanIndex)}
              />
            </Fragment>
          )
        }
        return (
          <Fragment key={i}>
            {text.slice(seg.start, seg.end)}
            <CitationBadge variant="no-ref" />
          </Fragment>
        )
      })}
    </span>
  )
}

function buildSegments(
  text: string,
  spans: CitationSpan[],
  noRefRanges: NoRefRange[],
  evidenceSet: EvidenceLike[]
): Segment[] {
  const evidenceIndex = new Map<string, EvidenceLike>()
  for (const e of evidenceSet) {
    if (e.id) evidenceIndex.set(e.id, e)
    if (e.docId) evidenceIndex.set(e.docId, e)
  }

  // Annotate each boundary event and sort by position.
  type Boundary =
    | { pos: number; kind: 'span-end'; span: CitationSpan; spanIndex: number }
    | { pos: number; kind: 'noref-end'; range: NoRefRange }

  const boundaries: Boundary[] = []
  spans.forEach((span, spanIndex) => {
    boundaries.push({ pos: span.textEnd, kind: 'span-end', span, spanIndex })
  })
  noRefRanges.forEach((range) => {
    boundaries.push({ pos: range.textEnd, kind: 'noref-end', range })
  })
  boundaries.sort((a, b) => a.pos - b.pos)

  const out: Segment[] = []
  let cursor = 0

  for (const boundary of boundaries) {
    if (cursor < boundary.pos) {
      out.push({ kind: 'text', start: cursor, end: boundary.pos })
      cursor = boundary.pos
    }
    if (boundary.kind === 'span-end') {
      const primaryRef = boundary.span.refs[0]
      if (primaryRef) {
        out.push({
          kind: 'ref',
          start: boundary.pos,
          end: boundary.pos,
          spanIndex: boundary.spanIndex,
          evidenceId: primaryRef.evidenceId,
          docId: primaryRef.docId,
          evidence:
            evidenceIndex.get(primaryRef.evidenceId) ??
            evidenceIndex.get(primaryRef.docId) ??
            null
        })
      }
    } else {
      out.push({ kind: 'no-ref', start: boundary.pos, end: boundary.pos })
    }
  }

  if (cursor < text.length) {
    out.push({ kind: 'text', start: cursor, end: text.length })
  }
  return out
}
