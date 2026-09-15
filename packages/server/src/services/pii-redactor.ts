/**
 * F5 · PII redaction for high-sensitivity content.
 *
 * Honest scope: this is a MITIGATION, not a complete solution.
 *
 * The full problem: embedding vectors are computed on plaintext content
 * before user-skill-crypto.ts encrypts the row. Recent literature
 * (Pan et al. 2020, Song & Raghunathan 2020) shows that for short
 * inputs (< 100 tokens), embedding inversion can recover ~80% of
 * the original text from the vector alone — even with only black-box
 * access to the embedding model.
 *
 * Real fix (out of scope here): searchable encryption schemes that
 * preserve cosine similarity over ciphertexts (CryptDB, ORE/OPE,
 * homomorphic-friendly embeddings). All require non-trivial infra
 * and trade off recall.
 *
 * What this module DOES: strip the highest-leverage identifiers
 * before embedding so the residual leak doesn't include PII like
 * "13800138000 — 张三 — zhangsan@example.com". An attacker who
 * inverts the embedding gets back the surrounding semantic context
 * but not the precise identifier.
 *
 * What this module does NOT do:
 *   - Defeat trait inference (e.g. "5 years B2B SaaS background"
 *     is still recoverable; that's a feature, not PII per se)
 *   - Catch every variant. Regex-based redaction is easily fooled
 *     by uncommon formats; production deployments should pair this
 *     with NER / named-entity recognition for higher recall.
 *
 * Opt-in via `USER_SKILL_REDACT_PII_ON_EMBED=true` env. When false
 * (default), redaction is a no-op for backward compat with existing
 * memory rows.
 */

interface RedactionRule {
  /** Short name used in placeholder + audit log. */
  kind: string
  /** Compiled regex. Should be /g for global match. */
  pattern: RegExp
}

// Order matters: longer / more-specific patterns first so substrings
// don't get partially matched (e.g. an email's local part shouldn't
// trigger the "name" rule).
const RULES: RedactionRule[] = [
  // Email addresses (RFC 5321 simplified — covers > 99% of real-world)
  {
    kind: 'EMAIL',
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  },
  // Chinese mainland mobile (1[3-9]xxxxxxxxx — 11 digits)
  {
    kind: 'PHONE_CN',
    pattern: /(?<![0-9])1[3-9]\d{9}(?![0-9])/g
  },
  // International phone with + prefix (E.164 simplified)
  {
    kind: 'PHONE_INTL',
    pattern: /(?<![0-9])\+\d{1,3}[-\s]?\d{4,14}(?![0-9])/g
  },
  // Chinese national ID (18 digits, last may be X)
  {
    kind: 'ID_CN',
    pattern: /(?<![0-9])\d{17}[0-9Xx](?![0-9])/g
  },
  // IPv4
  {
    kind: 'IP_V4',
    pattern: /(?<![0-9])(?:\d{1,3}\.){3}\d{1,3}(?![0-9])/g
  },
  // Credit card (13-19 digits with optional dashes/spaces)
  {
    kind: 'CC',
    pattern: /(?<![0-9])(?:\d[ -]?){13,19}(?![0-9])/g
  },
  // URLs (could leak referrer-style identifiers)
  {
    kind: 'URL',
    pattern: /https?:\/\/[^\s)>]+/g
  }
]

export interface RedactionResult {
  /** Text with each match replaced by `[REDACTED:KIND]` */
  redacted: string
  /** Per-kind counts for audit / logging */
  counts: Record<string, number>
  /** True when at least one rule fired */
  applied: boolean
}

/**
 * Apply all redaction rules. Idempotent — running on already-redacted
 * text leaves placeholders intact.
 *
 * Performance: O(n × rules) on input length. ~10 rules at typical
 * skill-content sizes (≤ 480 chars) is sub-millisecond.
 */
export function redactPii(input: string): RedactionResult {
  if (!input) return { redacted: input ?? '', counts: {}, applied: false }
  let text = input
  const counts: Record<string, number> = {}
  for (const rule of RULES) {
    let count = 0
    text = text.replace(rule.pattern, () => {
      count += 1
      return `[REDACTED:${rule.kind}]`
    })
    if (count > 0) counts[rule.kind] = count
  }
  return {
    redacted: text,
    counts,
    applied: Object.keys(counts).length > 0
  }
}

/**
 * Gate: is redaction enabled in the current environment?
 *
 * Default OFF for backward compat. Operators must explicitly opt in
 * via env so existing memory rows aren't suddenly redacted on the
 * next extraction pass (would create confusion: "why does this user-
 * skill say [REDACTED:PHONE_CN]?").
 */
export function isPiiRedactionEnabled(): boolean {
  return process.env.USER_SKILL_REDACT_PII_ON_EMBED === 'true'
}
