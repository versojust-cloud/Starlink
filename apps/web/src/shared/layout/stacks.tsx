/**
 * Stacks — left column "资料架", lists the KB documents and citations
 * available to the boardroom for this session.
 *
 * Visual model: a card-catalog drawer. Each item is a single line:
 *   ┌────────────────────────────────────────┐
 *   │ [N]  doc-stripe-pricing-2024 · chunk 7 │
 *   │      "Stripe charges 2.9% + $0.30 ..." │
 *   └────────────────────────────────────────┘
 *
 * The [N] number is the citation tag that appears in the Frontpage and
 * Wire — clicking syncs the surfaces (deferred to P3 wiring).
 */

export type StackEntry = {
  /** Citation index ([1], [2], ...). Stable per session. */
  index: number
  /** doc id (the source document). */
  docId: string
  /** Chunk id within doc. */
  chunkId: string
  /** Excerpt (first ~120 chars). */
  excerpt: string
  /** Optional source URL. */
  url?: string
}

interface StacksProps {
  entries: StackEntry[]
}

export function Stacks({ entries }: StacksProps) {
  return (
    <aside
      aria-label="Knowledge base citations"
      className="border-r-[1.5px] border-paper/80 bg-grain-ink relative h-full overflow-y-auto"
    >
      <header className="sticky top-0 z-10 border-b-[0.5px] border-ink-ash3/16 bg-ink/95 px-4 py-3">
        <span className="font-instr text-[10px] uppercase tracking-kicker text-paper-ash3">
          STACKS · CITED EVIDENCE
        </span>
      </header>

      {entries.length === 0 ? (
        <p className="font-instr text-[11px] uppercase tracking-kicker text-ink-ash4 px-4 py-6">
          (no citations yet)
        </p>
      ) : (
        <ol className="px-4 py-3 flex flex-col gap-4 relative z-[1]">
          {entries.map((e) => (
            <li
              key={`${e.docId}#${e.chunkId}`}
              className="flex flex-col gap-1 max-w-measure-body animate-editorial-publish"
            >
              <header className="flex items-baseline gap-2 border-b-[0.5px] border-ink-ash3/16 pb-1">
                <span className="font-instr text-[10px] tabular-nums text-press">
                  [{e.index}]
                </span>
                <span className="font-instr text-[10px] tabular-nums text-paper truncate">
                  {e.docId}
                </span>
                <span className="font-instr text-[10px] tabular-nums text-ink-ash4">
                  · {e.chunkId}
                </span>
              </header>
              <p className="font-body text-[12px] text-paper/70 leading-[1.5] italic">
                &ldquo;{e.excerpt}&rdquo;
              </p>
              {e.url ? (
                <a
                  href={e.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-instr text-[10px] uppercase tracking-kicker text-ink-ash4 hover:text-paper truncate"
                >
                  → SOURCE
                </a>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </aside>
  )
}
