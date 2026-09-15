/**
 * Unit tests for kb-extractor (RAG ingestion text extractors).
 *
 * Pure functions, no DB / no LLM. Run via `pnpm --filter @starlink/server test`.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  detectContentType,
  extractText,
  normalizeContentType,
  extractMarkdown,
  extractHtml,
  extractJson
} from './kb-extractor.js'

// ============================================================================
// normalizeContentType
// ============================================================================

test('normalizeContentType: lowercase + strip params', () => {
  assert.equal(normalizeContentType('TEXT/PLAIN'), 'text/plain')
  assert.equal(normalizeContentType('text/html; charset=utf-8'), 'text/html')
  assert.equal(normalizeContentType(' application/json ; encoding=utf-8'), 'application/json')
  assert.equal(normalizeContentType(undefined), 'text/plain')
  assert.equal(normalizeContentType(null), 'text/plain')
  assert.equal(normalizeContentType(''), 'text/plain')
})

// ============================================================================
// detectContentType
// ============================================================================

test('detectContentType: PDF magic number', () => {
  assert.equal(detectContentType('%PDF-1.5\nbinary stuff'), 'application/pdf')
  assert.equal(detectContentType('  %PDF-1.7\nleading whitespace'), 'application/pdf')
})

test('detectContentType: HTML by tag presence', () => {
  assert.equal(detectContentType('<!doctype html><html>...'), 'text/html')
  assert.equal(detectContentType('<HTML><body>x</body></html>'), 'text/html')
  assert.equal(
    detectContentType('<div><p>some prose</p><span>x</span></div>'),
    'text/html'
  )
})

test('detectContentType: JSON parse probe', () => {
  assert.equal(detectContentType('{"foo": "bar"}'), 'application/json')
  assert.equal(detectContentType('[1, 2, 3]'), 'application/json')
  // malformed JSON falls through
  assert.notEqual(detectContentType('{ unclosed'), 'application/json')
})

test('detectContentType: Markdown by heading or fence', () => {
  assert.equal(detectContentType('# Title\n\nbody'), 'text/markdown')
  assert.equal(detectContentType('## Sub\n\nmore'), 'text/markdown')
  assert.equal(detectContentType('Some intro\n\n```js\nx()\n```'), 'text/markdown')
})

test('detectContentType: plaintext fallback', () => {
  assert.equal(detectContentType('Just regular prose with no markup.'), 'text/plain')
  assert.equal(detectContentType('一段中文文字，纯 prose。'), 'text/plain')
})

test('detectContentType: hint wins over sniff (when not text/plain)', () => {
  // even though content looks like markdown, an explicit hint trumps
  assert.equal(detectContentType('# Heading', 'text/html'), 'text/html')
  // but text/plain hint defers to sniffing
  assert.equal(detectContentType('# Heading', 'text/plain'), 'text/markdown')
})

// ============================================================================
// extractMarkdown
// ============================================================================

test('extractMarkdown: heading hashes stripped', () => {
  assert.equal(extractMarkdown('# Title'), 'Title')
  assert.equal(extractMarkdown('### Subhead'), 'Subhead')
})

test('extractMarkdown: emphasis markers stripped, content kept', () => {
  const out = extractMarkdown('Some **bold** and *italic* text.')
  assert.equal(out, 'Some bold and italic text.')
})

test('extractMarkdown: links keep label only', () => {
  const out = extractMarkdown('See [the docs](https://example.com/path) for more.')
  assert.equal(out, 'See the docs for more.')
})

test('extractMarkdown: images keep alt text only', () => {
  const out = extractMarkdown('Header\n\n![diagram of pipeline](/img/x.png)')
  assert.match(out, /diagram of pipeline/)
  assert.doesNotMatch(out, /\/img\/x\.png/)
})

test('extractMarkdown: fenced code blocks dropped entirely', () => {
  const md = 'Intro.\n\n```js\nconst x = 1\nthrow new Error()\n```\n\nOutro.'
  const out = extractMarkdown(md)
  assert.match(out, /Intro/)
  assert.match(out, /Outro/)
  assert.doesNotMatch(out, /const x/)
  assert.doesNotMatch(out, /throw new/)
})

test('extractMarkdown: list bullets stripped, content kept', () => {
  const md = '- alpha\n- beta\n- gamma'
  const out = extractMarkdown(md)
  assert.match(out, /alpha/)
  assert.match(out, /beta/)
  assert.match(out, /gamma/)
  assert.doesNotMatch(out, /^- /m)
})

test('extractMarkdown: blockquote markers stripped', () => {
  const out = extractMarkdown('> A famous quote.\n> attributed to nobody.')
  assert.match(out, /A famous quote/)
  assert.doesNotMatch(out, /^>/m)
})

// ============================================================================
// extractHtml
// ============================================================================

test('extractHtml: drops script and style entirely', () => {
  const html =
    '<html><head><script>alert(1)</script><style>.x{color:red}</style></head><body><p>kept</p></body></html>'
  const out = extractHtml(html)
  assert.match(out, /kept/)
  assert.doesNotMatch(out, /alert\(1\)/)
  assert.doesNotMatch(out, /color:red/)
})

test('extractHtml: block tags become paragraph breaks', () => {
  const html = '<p>One</p><p>Two</p><div>Three</div>'
  const out = extractHtml(html)
  // 3 paragraphs joined with whitespace; check all three preserved
  assert.match(out, /One/)
  assert.match(out, /Two/)
  assert.match(out, /Three/)
})

test('extractHtml: HTML entities decoded', () => {
  const html = '<p>foo &amp; bar &lt;baz&gt; &quot;ok&quot;</p>'
  const out = extractHtml(html)
  assert.match(out, /foo & bar/)
  assert.match(out, /<baz>/)
  assert.match(out, /"ok"/)
})

test('extractHtml: comments stripped', () => {
  const out = extractHtml('<p>before</p><!-- secret comment --><p>after</p>')
  assert.match(out, /before/)
  assert.match(out, /after/)
  assert.doesNotMatch(out, /secret comment/)
})

// ============================================================================
// extractJson
// ============================================================================

test('extractJson: flat object → key:value lines', () => {
  const out = extractJson('{"name": "Stripe", "founded": 2010}')
  const lines = out.split('\n').sort()
  assert.deepEqual(lines, ['founded: 2010', 'name: Stripe'])
})

test('extractJson: arrays use [i] indexing', () => {
  const out = extractJson('{"founders": ["Patrick", "John"]}')
  assert.match(out, /founders\[0\]: Patrick/)
  assert.match(out, /founders\[1\]: John/)
})

test('extractJson: nested objects use dot path', () => {
  const out = extractJson('{"stats": {"funding": 12000000, "employees": 8000}}')
  assert.match(out, /stats\.funding: 12000000/)
  assert.match(out, /stats\.employees: 8000/)
})

test('extractJson: malformed JSON falls back to plaintext', () => {
  const malformed = '{ unclosed: "json'
  const out = extractJson(malformed)
  // fallback should preserve the source text (collapsed)
  assert.match(out, /unclosed/)
})

test('extractJson: null and empty containers handled', () => {
  const out = extractJson('{"a": null, "b": [], "c": {}}')
  assert.match(out, /a: null/)
  assert.match(out, /b: \[\]/)
  assert.match(out, /c: \{\}/)
})

// ============================================================================
// extractText (top-level dispatch)
// ============================================================================

test('extractText: plaintext is pass-through (with whitespace collapse)', () => {
  const out = extractText('hello   world\n\n\nfoo', 'text/plain')
  assert.equal(out, 'hello world\n\nfoo')
})

test('extractText: PDF throws with install hint', () => {
  assert.throws(
    () => extractText('%PDF-1.5\nbinary', 'application/pdf'),
    /pdf-parse|pdfjs-dist/
  )
})

test('extractText: unknown content-type falls back to plaintext', () => {
  const out = extractText('arbitrary content', 'application/x-novel-format')
  assert.equal(out, 'arbitrary content')
})

test('extractText: dispatch routes by content-type', () => {
  // Markdown sample → strips headings
  assert.equal(extractText('# Title\n\nbody', 'text/markdown'), 'Title\n\nbody')
  // HTML sample → strips tags
  assert.match(extractText('<p>hi</p>', 'text/html'), /hi/)
  // JSON sample → flattens
  assert.match(extractText('{"k": "v"}', 'application/json'), /k: v/)
})
