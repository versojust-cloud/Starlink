'use client'

/**
 * ReportCardNode — Phase 6 (2026-05-04). The single canvas representation
 * of a `report-card` macra-typed node emitted by the report-writer agent.
 *
 * Visual: dark ink-themed brutalist card (inverse of the white BMC cells
 * to read as "summary product, not raw input"). Width 420px. Header
 * shows REPORT kicker + timestamp; body lists the 6 section titles
 * parsed from the markdown content as a TOC; footer is a "📖 在抽屉中
 * 阅读完整报告" CTA that opens the detail drawer for inline reading.
 *
 * Click anywhere on the card → opens detail drawer (same as the CTA).
 * The drawer hosts the full multi-section report rendered through the
 * agent-output renderer registry (ReportWriterRenderer with surface='drawer').
 */

import { memo, useMemo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { useComfyStore } from '../../store'
import { FileText, ChevronRight } from 'lucide-react'

const REPORT_TINT = '#6B6B7C' // synthesizer byline tint
const SECTION_HEADING_RE = /^##\s+(.+?)$/gm

/** Parse the markdown content into a list of `## Section Title` strings. */
function extractSections(markdown: string): string[] {
  if (!markdown) return []
  const sections: string[] = []
  let m: RegExpExecArray | null
  // Use a fresh local regex to avoid state leak across renders.
  const re = new RegExp(SECTION_HEADING_RE.source, 'gm')
  while ((m = re.exec(markdown)) !== null) {
    sections.push(m[1].trim())
  }
  return sections
}

interface ReportNodeData {
  type?: string
  title?: string
  content?: string
  meta?: {
    macraType?: string
    metadata?: {
      agent_signature?: string
      stage?: string
      tags?: string[]
    }
  }
}

export const ReportCardNode = memo(function ReportCardNode({ id, data }: NodeProps) {
  const openDetailPanel = useComfyStore((state) => state.openDetailPanel)
  const macraNode = useComfyStore((state) => state.macraNodes.get(id))
  const nodeData = (macraNode ?? data ?? {}) as ReportNodeData

  // Content lives either on the macra map (`content`) or on the canvas
  // node `data.content` (depending on hydration path).
  const content =
    (typeof (nodeData as { content?: string }).content === 'string'
      ? (nodeData as { content?: string }).content
      : undefined) ??
    ''
  const title =
    (typeof (nodeData as { label?: string; title?: string }).label === 'string'
      ? (nodeData as { label?: string }).label
      : undefined) ??
    (typeof (nodeData as { title?: string }).title === 'string'
      ? (nodeData as { title?: string }).title
      : undefined) ??
    '商业报告'

  const sections = useMemo(() => extractSections(content), [content])
  const wordCount = content?.length ?? 0

  return (
    <>
      {/* Top handle for incoming references (rare for report cards, but harmless). */}
      <Handle
        type="target"
        position={Position.Top}
        style={{
          width: 8,
          height: 8,
          background: '#F4F0E8',         // paper
          border: '0.5px solid rgba(10,10,10,0.4)',
        }}
      />

      <div
        onClick={(e) => {
          // Stop ReactFlow from claiming the click as selection-only
          e.stopPropagation()
          openDetailPanel(id)
        }}
        className="group relative w-[420px] bg-[#0A0A0A] text-[#F4F0E8] cursor-pointer transition-colors"
        style={{
          // Inverse 3px edge in synth tint — visually links it to
          // synthesizer's output family while keeping the inverted
          // contrast that signals "summary product".
          boxShadow: `inset 3px 0 0 0 ${REPORT_TINT}`,
        }}
      >
        {/* Header: kicker + meta */}
        <div className="border-b border-[#2A2826] px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[#8A8784]">
              REPORT · 整份商业报告
            </span>
            <span className="font-mono text-[9px] tabular-nums text-[#8A8784]">
              {wordCount.toLocaleString()} 字
            </span>
          </div>
          <h3 className="font-display font-[700] text-[18px] tracking-tight text-[#F4F0E8] line-clamp-2 leading-tight">
            {title}
          </h3>
        </div>

        {/* Section TOC */}
        <ul className="px-4 py-3 space-y-1.5">
          {sections.length > 0 ? (
            sections.slice(0, 6).map((sec, i) => (
              <li
                key={i}
                className="flex items-baseline gap-2 text-[12px] text-[#D8D5CE] leading-snug"
              >
                <span className="font-mono text-[10px] tabular-nums text-[#8A8784] shrink-0 w-5">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="font-body line-clamp-1 flex-1">{sec}</span>
              </li>
            ))
          ) : (
            <li className="font-body text-[11px] text-[#8A8784] italic">
              内容尚未生成 section 标题
            </li>
          )}
        </ul>

        {/* Footer CTA */}
        <div className="border-t border-[#2A2826] px-4 py-2.5 flex items-center justify-between bg-[#161514]">
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[#D8D5CE]">
            <FileText className="h-3 w-3" strokeWidth={1.75} />
            在抽屉中阅读完整报告
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-[#8A8784] group-hover:text-[#F4F0E8] transition-colors" strokeWidth={1.75} />
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          width: 8,
          height: 8,
          background: '#F4F0E8',
          border: '0.5px solid rgba(10,10,10,0.4)',
        }}
      />
    </>
  )
})
