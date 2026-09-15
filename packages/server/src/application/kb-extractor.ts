/**
 * Content-type-aware text extractor for KB ingestion (2026-04-28).
 *
 * Pipeline:  raw bytes/string  →  extractText  →  plain prose  →  chunker
 *                                  (this module)         (KbStore.chunkText)
 *
 * Why a separate module: the chunker assumes its input is already prose.
 * Real-world KB content arrives as Markdown, HTML, JSON, PDFs, etc. Each
 * needs a different stripper to yield prose without polluting embeddings
 * with syntax noise (e.g. embedding `## Title` includes "##" which dilutes
 * the semantic vector for a query like "title").
 *
 * Coverage matrix (at this commit):
 *
 *   text/plain               ✅ pass-through
 *   text/markdown            ✅ regex strip (good for prose-heavy MD)
 *   text/html                ✅ regex strip (was inline in kb-task-service)
 *   application/json         ✅ flatten to "key.path: value" lines
 *   application/pdf          ⚠️ throws with clear install-pdfjs-dist hint
 *   <other>                  ⚠️ falls back to "treat as plaintext"
 *
 * No external dependencies. PDF coverage is intentionally a fail-fast
 * with a clear error, not a silent degrade — if a user uploads a PDF,
 * the operator should see WHY ingestion fails and pick whether to add
 * pdfjs-dist (or pdf-parse, etc) as a dependency.
 */

const PDF_INSTALL_HINT =
  "kb-extractor: PDF ingestion requires a PDF text extractor. Install one " +
  "(e.g. `pnpm add pdf-parse` or `pnpm add pdfjs-dist` in @starlink/server) " +
  "and wire it into kb-extractor.ts via a dynamic import; until then, PDF " +
  "uploads are rejected at ingestion time rather than silently producing " +
  "empty chunks."

export interface ExtractOptions {
  /** Hint about expected length; used only for log/audit. */
  expectedMinLength?: number
}

/**
 * Normalise a raw `contentType` string to a canonical form
 * (lower-cased, strip params like `; charset=utf-8`).
 */
export function normalizeContentType(raw: string | undefined | null): string {
  if (!raw) return 'text/plain'
  const head = raw.toLowerCase().split(';')[0]?.trim()
  return head || 'text/plain'
}

/**
 * Best-effort detection from raw content + optional MIME hint. Uses simple
 * sniffs:
 *   - hint already set → trust it
 *   - "%PDF-" header → application/pdf
 *   - leading "{" or "[" with valid JSON → application/json
 *   - "<html" / "<!DOCTYPE html" / many tags → text/html
 *   - "# " or "## " or "```" → text/markdown
 *   - else → text/plain
 */
export function detectContentType(content: string, hint?: string): string {
  if (hint) {
    const h = normalizeContentType(hint)
    if (h !== 'text/plain') return h
  }
  const trimmed = content.trim().slice(0, 256)
  if (trimmed.startsWith('%PDF-')) return 'application/pdf'
  if (/^<!doctype html|<html[\s>]/i.test(trimmed)) return 'text/html'
  if (/<[a-z][\s\S]*?>/i.test(trimmed) && /<\/[a-z]+>/i.test(content)) return 'text/html'
  if (
    (trimmed.startsWith('{') || trimmed.startsWith('[')) &&
    looksLikeJson(content)
  ) {
    return 'application/json'
  }
  if (/(^|\n)#{1,6}\s/.test(trimmed) || /(^|\n)```/.test(trimmed)) {
    return 'text/markdown'
  }
  return 'text/plain'
}

function looksLikeJson(content: string): boolean {
  // Cheap probe — try to JSON.parse only if content is short enough that
  // the parse cost is negligible. For larger inputs we trust the leading
  // brace heuristic.
  if (content.length > 64 * 1024) return /[{}\[\]"]/.test(content.slice(0, 1024))
  try {
    JSON.parse(content)
    return true
  } catch {
    return false
  }
}

/**
 * Extract prose from a string content blob. Used when the upstream
 * already decoded bytes to UTF-8 (the typical text-file path). For
 * binary formats (PDF / DOCX / XLSX), use extractBinary instead.
 */
export function extractText(
  content: string,
  contentType: string,
  _options: ExtractOptions = {}
): string {
  const ct = normalizeContentType(contentType)
  switch (ct) {
    case 'text/plain':
    case 'text/txt':
      return collapseWhitespace(content)
    case 'text/markdown':
    case 'text/x-markdown':
      return extractMarkdown(content)
    case 'text/html':
    case 'application/xhtml+xml':
      return extractHtml(content)
    case 'application/json':
    case 'text/json':
      return extractJson(content)
    case 'application/pdf':
      throw new Error(PDF_INSTALL_HINT)
    default:
      // Unknown type — best-effort treat as plaintext rather than reject.
      // Audit log will show the original content-type for triage.
      return collapseWhitespace(content)
  }
}

/**
 * F4 (phase 1) · Binary extractors for PDF / DOCX / XLSX.
 *
 * Lazily imports the heavy parsers (pdf-parse / mammoth / xlsx) so:
 *   - boot time stays fast (no deserialisation cost on cold start)
 *   - environments without these deps installed still load the module
 *
 * Returns plain prose suitable for the existing chunker pipeline.
 *
 * Throws on parse failure (caller in addBinaryDocument records as
 * task.status='failed' with the message). Empty extraction throws too,
 * so we never silently produce 0-chunk docs.
 */
export async function extractBinary(
  buffer: Buffer,
  contentType: string,
  options: { fileName?: string } = {}
): Promise<string> {
  const ct = normalizeContentType(contentType)
  // Some browsers send octet-stream for files they don't recognise; sniff
  // the extension as a fallback.
  const lowerName = (options.fileName ?? '').toLowerCase()
  const sniffPdf = ct === 'application/pdf' || lowerName.endsWith('.pdf')
  const sniffDocx =
    ct === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || lowerName.endsWith('.docx')
  const sniffXlsx =
    ct === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    || lowerName.endsWith('.xlsx')
    || lowerName.endsWith('.xls')

  if (sniffPdf) {
    return await extractPdf(buffer)
  }
  if (sniffDocx) {
    return await extractDocx(buffer)
  }
  if (sniffXlsx) {
    return await extractXlsx(buffer)
  }
  // Fall back to UTF-8 decode + extractText. Useful for binaries that
  // happen to be plaintext misreported (e.g. .log served as octet-stream).
  return extractText(buffer.toString('utf-8'), 'text/plain', {})
}

async function extractPdf(buffer: Buffer): Promise<string> {
  // pdf-parse 2.x exports a `PDFParse` class. Older 1.x exported a
  // default function — we don't pin to that to avoid downgrade risk.
  const mod = await import('pdf-parse')
  const PDFParse = mod.PDFParse
  // pdfjs takes ownership of the buffer; clone to keep our caller's
  // copy intact (defensive — addDocument doesn't reuse the buffer
  // but this avoids surprises).
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  try {
    const result = await parser.getText()
    const raw = result?.text ?? ''
    const cleaned = collapseWhitespace(raw)
    if (!cleaned) {
      throw new Error(
        'kb-extractor.extractPdf: extracted 0 chars. PDF may be image-only (needs OCR) or encrypted.'
      )
    }
    return cleaned
  } finally {
    // Always free the parser worker, even on extract error.
    await parser.destroy().catch(() => {})
  }
}

async function extractDocx(buffer: Buffer): Promise<string> {
  // mammoth.extractRawText returns { value: string, messages: [...] }
  // value is plain text; warnings (style errors etc) live in messages
  // and are non-fatal.
  const mammoth = await import('mammoth')
  const { value } = await mammoth.extractRawText({ buffer })
  const cleaned = collapseWhitespace(value ?? '')
  if (!cleaned) {
    throw new Error('kb-extractor.extractDocx: extracted 0 chars; document may be empty.')
  }
  return cleaned
}

async function extractXlsx(buffer: Buffer): Promise<string> {
  const xlsx = await import('xlsx')
  const wb = xlsx.read(buffer, { type: 'buffer' })
  const parts: string[] = []
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName]
    if (!sheet) continue
    // CSV form is the most prose-friendly for embedding: the chunker
    // sees "row1col1, row1col2" sequences which embed as natural text.
    // Sheet name becomes a section heading so cross-sheet queries
    // ("which sheet mentions X?") work.
    const csv = xlsx.utils.sheet_to_csv(sheet, { blankrows: false })
    if (csv.trim()) {
      parts.push(`## ${sheetName}\n\n${csv.trim()}`)
    }
  }
  const cleaned = parts.join('\n\n').trim()
  if (!cleaned) {
    throw new Error('kb-extractor.extractXlsx: workbook has no non-empty sheets.')
  }
  return cleaned
}

/**
 * Quick predicate — should the upload pipeline route through extractBinary
 * (binary parsers) or extractText (string parsers)? Used by KbStore to
 * decide whether to base64-decode the incoming content.
 */
export function isBinaryContentType(contentType: string, fileName?: string): boolean {
  const ct = normalizeContentType(contentType)
  if (ct === 'application/pdf') return true
  if (ct === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return true
  if (ct === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return true
  if (ct === 'application/octet-stream' && fileName) {
    const lower = fileName.toLowerCase()
    return (
      lower.endsWith('.pdf')
      || lower.endsWith('.docx')
      || lower.endsWith('.xlsx')
      || lower.endsWith('.xls')
    )
  }
  return false
}

// =============================================================================
// Per-type extractors
// =============================================================================

/**
 * Strip Markdown syntax to prose. Preserves paragraph breaks (double
 * newlines), drops emphasis markers / link syntax / fenced-code markers /
 * headings → text. Rough but stable; no markdown-it dependency.
 */
export function extractMarkdown(md: string): string {
  let text = md
  // Drop fenced code blocks entirely (rarely useful prose, often noise).
  text = text.replace(/```[\s\S]*?```/g, ' ')
  // Inline code: keep contents.
  text = text.replace(/`([^`\n]+)`/g, '$1')
  // Images: keep alt text only.
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  // Links: keep label only.
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  // Reference-style link defs: drop.
  text = text.replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, '')
  // Headings: drop the '#'s, keep text.
  text = text.replace(/^#{1,6}\s+/gm, '')
  // Bold/italic markers.
  text = text.replace(/(\*{1,3}|_{1,3})([^*_]+?)\1/g, '$2')
  // Blockquote markers.
  text = text.replace(/^>\s?/gm, '')
  // Horizontal rules.
  text = text.replace(/^[-*_]{3,}\s*$/gm, '')
  // List bullets / numbered: drop the leading marker, keep content.
  text = text.replace(/^\s*([-*+]|\d+\.)\s+/gm, '')
  // Strikethrough.
  text = text.replace(/~~([^~]+)~~/g, '$1')
  // HTML tags that may sneak into MD.
  text = text.replace(/<[^>]+>/g, ' ')
  // Collapse 3+ newlines to 2 (paragraph break) and trim.
  text = text.replace(/\n{3,}/g, '\n\n')
  return text.trim()
}

/**
 * Strip HTML to prose. Drops script/style/comments/tags + entity decode +
 * whitespace normalisation. Same routine that used to live inline in
 * kb-task-service; lifted here so the same logic runs whether the upload
 * goes through `addKnowledgeSeed` or `importKnowledgeUrl`.
 */
export function extractHtml(html: string): string {
  let text = html
  text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ')
  text = text.replace(/<!--[\s\S]*?-->/g, ' ')
  // Convert block-ish tags to paragraph breaks before stripping.
  text = text.replace(/<\/?(p|div|br|h[1-6]|li|tr|td|th|article|section)[^>]*>/gi, '\n\n')
  text = text.replace(/<[^>]+>/g, ' ')
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  return collapseWhitespace(text)
}

/**
 * Flatten a JSON document into "key.path: value" lines (one per leaf
 * scalar). Arrays are indexed; objects are dot-pathed. The result reads
 * like a record card and embeds well — the embedding picks up both the
 * key names AND the values rather than treating raw JSON as a single
 * brace-heavy blob.
 */
export function extractJson(jsonText: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    // Malformed JSON — fall back to plaintext.
    return collapseWhitespace(jsonText)
  }
  const lines: string[] = []
  walkJson(parsed, '', lines)
  return lines.join('\n')
}

function walkJson(value: unknown, path: string, out: string[]): void {
  if (value === null || value === undefined) {
    out.push(`${path || 'root'}: null`)
    return
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    out.push(`${path || 'root'}: ${String(value)}`)
    return
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      out.push(`${path || 'root'}: []`)
      return
    }
    value.forEach((item, i) => walkJson(item, `${path}[${i}]`, out))
    return
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj)
    if (keys.length === 0) {
      out.push(`${path || 'root'}: {}`)
      return
    }
    for (const k of keys) {
      walkJson(obj[k], path ? `${path}.${k}` : k, out)
    }
    return
  }
  out.push(`${path || 'root'}: ${String(value)}`)
}

// =============================================================================
// Util
// =============================================================================

function collapseWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[  ]+/g, ' ')
    .replace(/\n[ ]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
