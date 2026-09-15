/**
 * Default fallback renderer — used by any agent without a dedicated
 * specialized renderer. Routes by surface:
 *
 *   - chat:    compact tailwind prose (12px Geist, tight spacing)
 *   - drawer:  EditorialProse — magazine-grade reading typography
 *              (drop cap, Fraunces section titles, hairline rules,
 *              pull quotes, mono list markers)
 *   - panel:   medium tailwind prose (12px Geist, sectioned)
 *
 * Catches: synthesizer / general-responder / opponents / unknown agents
 * when their specialized renderer doesn't match. The drawer surface
 * upgrade gives every agent's long-form output the same magazine feel
 * the report-writer enjoys, without each renderer having to re-implement
 * editorial styling.
 */

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { EditorialProse } from './editorial-prose'
import type { AgentOutputRenderer, AgentOutputContext } from '../agent-output-renderer-registry'

const COMPACT_PROSE_CLASS: Record<Exclude<AgentOutputContext['surface'], 'drawer'>, string> = {
  chat:  'prose prose-sm max-w-none break-words [&>*]:my-1 [&_p]:leading-[1.6] [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h2]:font-display [&_h2]:font-[700] [&_h2]:text-[13px] [&_h2]:mt-2 [&_h2]:mb-1 [&_h2]:text-stratum-navy [&_h3]:font-display [&_h3]:font-[700] [&_h3]:text-[12px] [&_h3]:mt-1.5 [&_strong]:font-semibold [&_code]:bg-stratum-surface-low [&_code]:px-1 [&_code]:rounded [&_code]:font-mono [&_code]:text-[11px]',
  panel: 'prose prose-sm max-w-none break-words [&>*]:my-1.5 [&_p]:leading-[1.65] [&_p]:text-[12px] [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h2]:font-display [&_h2]:font-[700] [&_h2]:text-[14px] [&_h2]:mt-2 [&_h2]:mb-1.5 [&_h2]:text-stratum-navy [&_h3]:font-display [&_h3]:font-[700] [&_h3]:text-[12px] [&_strong]:font-semibold [&_code]:bg-stratum-surface-low [&_code]:px-1 [&_code]:rounded [&_code]:font-mono [&_code]:text-[11px]',
}

export const DefaultMarkdownRenderer: AgentOutputRenderer = {
  id: 'default-markdown',
  match: () => true,
  render: (ctx) => {
    if (ctx.surface === 'drawer') {
      return <EditorialProse content={ctx.content || ''} density="reading" />
    }
    return (
      <div className={COMPACT_PROSE_CLASS[ctx.surface]}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{ctx.content || ''}</ReactMarkdown>
      </div>
    )
  },
}
