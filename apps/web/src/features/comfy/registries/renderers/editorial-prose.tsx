/**
 * EditorialProse — opinionated Markdown renderer for the report-writer
 * drawer surface. Replaces tailwind's generic `prose` class with a
 * tightly-controlled set of element renderers tuned for long-form
 * editorial reading (newspaper / Stratechery aesthetic).
 *
 * What's specifically tuned vs default tailwind prose:
 *   - h2 / h3:    Fraunces serif, larger optical sizes, narrower tracking
 *   - p:          14px Geist, line-height 1.85, generous margin (typography
 *                 research: 1.7-1.9 line-height optimal for body)
 *   - First-of-section p: drop cap (initial letter inline-large, Fraunces)
 *   - blockquote: pull quote — Fraunces 16px italic, left-rule, no quote chars
 *   - strong:     ink-darker than body for emphasis weight
 *   - ul / ol:    custom mono-tabular markers; tighter pad
 *   - hr:         press-red 0.5px hairline (semantically a section break)
 *   - table:      hairline borders, tabular-nums, headers in mono kicker
 *   - code:       inline mono on paper-tinted bg; block code on ink with
 *                 paper text
 *   - inline citation chips (already tokenized by parent renderer): pass
 *     through unchanged
 *
 * Density modes via `density` prop:
 *   - 'reading' (drawer): the full editorial treatment above
 *   - 'compact' (chat): 12px Geist, line-height 1.65, no drop cap, smaller h2
 */

import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  /** Already-tokenized markdown string. Citation chips should already be
   *  inlined into the text via the parent renderer's tokenizer. */
  content: string
  density?: 'reading' | 'compact'
  /** Custom paragraph children processor (lets parent inject citation chips). */
  paragraphProcessor?: (children: ReactNode) => ReactNode
  /** Same idea for list items. */
  listItemProcessor?: (children: ReactNode) => ReactNode
}

const READING_BODY = 'font-body text-[14.5px] leading-[1.85] text-stratum-ink'
const COMPACT_BODY = 'font-body text-[12px] leading-[1.65] text-stratum-ink'

export function EditorialProse({ content, density = 'reading', paragraphProcessor, listItemProcessor }: Props) {
  const isReading = density === 'reading'

  return (
    <div className={`editorial-prose ${isReading ? READING_BODY : COMPACT_BODY}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) =>
            isReading ? (
              <h1 className="font-display font-[800] text-[30px] leading-[1.15] tracking-tight text-stratum-navy mt-8 mb-4">
                {children}
              </h1>
            ) : (
              <h1 className="font-display font-[700] text-[18px] leading-[1.2] tracking-tight text-stratum-navy mt-3 mb-1.5">
                {children}
              </h1>
            ),

          h2: ({ children }) =>
            isReading ? (
              // Newspaper-section header: kicker-eyebrow + serif title +
              // hairline rule. The "eyebrow" is implied via tracking on
              // the heading itself instead of an extra line — keeps the
              // markup pure h2 for SEO / scrolling.
              <div className="mt-10 mb-5 first:mt-0">
                <h2 className="font-display font-[800] text-[24px] leading-[1.2] tracking-tight text-stratum-navy">
                  {children}
                </h2>
                <div className="mt-1.5 h-[1.5px] bg-stratum-navy w-12" />
              </div>
            ) : (
              <h2 className="font-display font-[700] text-[15px] leading-[1.2] tracking-tight text-stratum-navy mt-4 mb-1.5 border-b-[0.5px] border-stratum-line pb-1">
                {children}
              </h2>
            ),

          h3: ({ children }) =>
            isReading ? (
              <h3 className="font-display font-[700] text-[17px] leading-[1.3] tracking-tight text-stratum-navy mt-6 mb-2">
                {children}
              </h3>
            ) : (
              <h3 className="font-display font-[700] text-[13px] leading-[1.3] text-stratum-navy mt-3 mb-1">
                {children}
              </h3>
            ),

          // P12 fix · h4 was styled as a "kicker eyebrow"
          // (font-mono / 10px / uppercase / muted gray) which made
          // sense for English mode but BMC agents emit h4 for
          // genuine numbered sub-headers in Chinese ("1. V2EX 技术
          // 社区精准投放", "3. B 站编程类 UP 主合作测评"). Mono+
          // uppercase has no effect on CJK characters, and muted-gray
          // (#6B7280) on the drawer's stratum-surface-low (#F2F4F6)
          // background was nearly unreadable. Switch to the same
          // display-serif weight as h3 but smaller so the visual
          // hierarchy h2 > h3 > h4 still works.
          h4: ({ children }) => (
            <h4 className="font-display font-[600] text-[13px] leading-[1.35] tracking-tight text-stratum-navy mt-3 mb-1">
              {children}
            </h4>
          ),

          p: ({ children }) => {
            const processed = paragraphProcessor ? paragraphProcessor(children) : children
            return (
              <p className={`my-${isReading ? '4' : '2'} ${isReading ? 'first-of-type:editorial-dropcap' : ''}`}>
                {processed}
              </p>
            )
          },

          ul: ({ children }) => (
            <ul className={`editorial-list ${isReading ? 'my-5 pl-7' : 'my-2 pl-5'} list-none`}>
              {children}
            </ul>
          ),

          ol: ({ children }) => (
            <ol className={`editorial-list-num ${isReading ? 'my-5 pl-8' : 'my-2 pl-6'} list-decimal`}>
              {children}
            </ol>
          ),

          li: ({ children }) => {
            const processed = listItemProcessor ? listItemProcessor(children) : children
            // P12 fix · explicit text-stratum-ink so spans inside the
            // li (especially "<strong>label</strong><span>: value</span>"
            // patterns the BMC agents emit) inherit the same dark color.
            // Without this, some browsers / certain ancestor classes
            // caused the plain-text spans to render at a faded weight.
            return (
              <li className={`${isReading ? 'my-2' : 'my-0.5'} editorial-list-item relative text-stratum-ink`}>
                {processed}
              </li>
            )
          },

          blockquote: ({ children }) => (
            <blockquote
              className={`editorial-pullquote ${
                isReading
                  ? 'my-7 pl-6 pr-2 py-2 text-[16.5px] leading-[1.65] italic'
                  : 'my-3 pl-3 text-[12.5px] leading-[1.55] italic'
              } font-display text-stratum-navy border-l-[2px] border-stratum-navy`}
            >
              {children}
            </blockquote>
          ),

          strong: ({ children }) => (
            <strong className="font-semibold text-[#0A0A0A]">{children}</strong>
          ),

          em: ({ children }) => (
            <em className="italic text-stratum-navy/90">{children}</em>
          ),

          hr: () => (
            <hr className="my-8 border-0 h-[0.5px] bg-stratum-navy/30" aria-hidden="true" />
          ),

          code: ({ className, children }) => {
            const isBlock = typeof className === 'string' && className.startsWith('language-')
            if (isBlock) {
              return (
                <pre className={`my-5 p-3 bg-[#0A0A0A] text-[#F4F0E8] overflow-x-auto`}>
                  <code className="font-mono text-[12px] leading-[1.5]">{children}</code>
                </pre>
              )
            }
            return (
              <code className="font-mono text-[12.5px] bg-stratum-surface-low text-stratum-navy px-1 py-0.5 border border-stratum-line">
                {children}
              </code>
            )
          },

          table: ({ children }) => (
            <div className="my-5 -mx-1 overflow-x-auto rounded-[1px] border-[1px] border-stratum-line bg-white">
              <table className="w-full border-collapse text-[12.5px] leading-[1.55] tabular-nums">
                {children}
              </table>
            </div>
          ),

          thead: ({ children }) => (
            <thead className="bg-stratum-surface-low border-b-[1.5px] border-stratum-navy">
              {children}
            </thead>
          ),

          tbody: ({ children }) => <tbody>{children}</tbody>,

          tr: ({ children }) => (
            <tr className="border-b-[0.5px] border-stratum-line last:border-b-0 hover:bg-stratum-surface-low/40 transition-colors">
              {children}
            </tr>
          ),

          th: ({ children }) => (
            <th className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-stratum-muted text-left px-3 py-2 whitespace-nowrap">
              {children}
            </th>
          ),

          td: ({ children }) => (
            <td className="px-3 py-2 text-stratum-ink align-top">{children}</td>
          ),

          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-stratum-blue underline decoration-stratum-blue/40 underline-offset-2 hover:decoration-stratum-blue transition-colors"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>

      {/* Editorial-specific styles applied via global CSS in this block.
           Not extracted to a separate file because they're tightly scoped
           to .editorial-prose and would otherwise pollute the global
           cascade. */}
      <style jsx global>{`
        .editorial-prose .editorial-dropcap::first-letter {
          font-family: var(--font-fraunces, 'Fraunces', serif);
          font-weight: 800;
          font-size: 3.4em;
          line-height: 0.85;
          float: left;
          padding-right: 0.08em;
          padding-top: 0.08em;
          color: #0A0A0A;
        }
        .editorial-prose .editorial-list .editorial-list-item::before {
          content: '—';
          position: absolute;
          left: -1.4em;
          top: 0;
          font-family: var(--font-jetbrains-mono, 'JetBrains Mono', monospace);
          color: #6E6B66;
          font-size: 0.92em;
          line-height: inherit;
        }
        .editorial-prose .editorial-list-num li::marker {
          font-family: var(--font-jetbrains-mono, 'JetBrains Mono', monospace);
          color: #6E6B66;
          font-size: 0.85em;
          font-weight: 600;
        }
      `}</style>
    </div>
  )
}
