/**
 * Boot-time production configuration validation.
 *
 * Runs ONCE on server start when NODE_ENV=production. Fails fast (process
 * exit code 1) when any production gate is missing or matches a known
 * placeholder. Dev / test runs are unaffected — the assertion is gated
 * behind isProduction().
 *
 * Categories:
 *   - hard required: missing → cannot operate (DATABASE_URL).
 *   - auth required: missing → server is wide open
 *     (INTERNAL_SERVICE_TOKEN, AUTH_JWT_SECRET when AUTH_MODE=jwt).
 *   - placeholder rejected: literal "change-me" / empty string is not
 *     a real secret. We refuse to boot rather than silently accepting it.
 *
 * Why fail-fast vs warn: an internal token left unset accepts EVERY
 * request as authorized at routes/internal-task-events.ts:10 (line is
 * `if (!expected) return true`). That's a CVE-shaped hole in production.
 * A boot crash is the only safe response.
 */

const PLACEHOLDER_VALUES = new Set(['', 'change-me', 'changeme', 'todo', 'TODO'])

interface ConfigIssue {
  variable: string
  detail: string
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

export function checkProductionConfig(): ConfigIssue[] {
  const issues: ConfigIssue[] = []

  // Hard required for any operation.
  if (!process.env.DATABASE_URL) {
    issues.push({ variable: 'DATABASE_URL', detail: 'unset; PG pool cannot connect' })
  }

  // Auth gates.
  const internalToken = process.env.INTERNAL_SERVICE_TOKEN
  if (!internalToken || PLACEHOLDER_VALUES.has(internalToken)) {
    issues.push({
      variable: 'INTERNAL_SERVICE_TOKEN',
      detail:
        `unset or placeholder (${JSON.stringify(internalToken ?? '')}). The /internal/* ` +
        `routes default-allow when this is empty — production must set a real secret.`
    })
  }

  const authMode = process.env.AUTH_MODE ?? 'disabled'
  if (authMode === 'disabled') {
    issues.push({
      variable: 'AUTH_MODE',
      detail: 'still "disabled". Production should set AUTH_MODE=jwt to require Authorization headers.'
    })
  }
  if (authMode === 'jwt') {
    const secret = process.env.AUTH_JWT_SECRET ?? ''
    if (PLACEHOLDER_VALUES.has(secret) || secret.length < 32) {
      issues.push({
        variable: 'AUTH_JWT_SECRET',
        detail: `unset, placeholder, or shorter than 32 chars (got ${secret.length}). Generate with \`openssl rand -base64 48\`.`
      })
    }
  }

  // Embedding provider — local-hash gives recall ≈ 0; production must use
  // a real provider so RAG / memory vector search are functional.
  const embeddingProvider = process.env.EMBEDDING_PROVIDER?.toLowerCase()
  if (embeddingProvider === 'local-hash') {
    issues.push({
      variable: 'EMBEDDING_PROVIDER',
      detail: 'set to "local-hash" — semantic recall is ~0. Production must set EMBEDDING_PROVIDER=remote (or omit) and provide EMBEDDING_API_KEY/BASE_URL.'
    })
  }
  const embeddingKey = process.env.EMBEDDING_API_KEY
                    ?? process.env.OPENAI_API_KEY
                    ?? process.env.LLM_API_KEY
  if (!embeddingKey || PLACEHOLDER_VALUES.has(embeddingKey)) {
    issues.push({
      variable: 'EMBEDDING_API_KEY',
      detail: 'unset or placeholder. Set EMBEDDING_API_KEY (or OPENAI_API_KEY / LLM_API_KEY as fallback) so the embedding service can call a real provider.'
    })
  }

  // user-skill envelope encryption — without a master key, sensitive
  // user-inferred traits (domain expertise, blind spots) sit unencrypted
  // in PostgreSQL. Production must opt-in.
  const userSkillKey = process.env.USER_SKILL_ENCRYPTION_KEY ?? ''
  if (PLACEHOLDER_VALUES.has(userSkillKey) || userSkillKey.length < 32) {
    issues.push({
      variable: 'USER_SKILL_ENCRYPTION_KEY',
      detail: `unset, placeholder, or shorter than 32 chars (got ${userSkillKey.length}). user-skill rows + their embeddings will be stored in plaintext. Generate with \`openssl rand -base64 32\`.`
    })
  }

  // Database SSL — cloud PG (Aliyun / Supabase / Neon) requires SSL.
  // Disabling SSL in production likely indicates a misconfiguration.
  const pgSsl = process.env.PG_SSL?.toLowerCase()
  if (pgSsl === 'disable' || pgSsl === 'false' || pgSsl === 'off') {
    issues.push({
      variable: 'PG_SSL',
      detail: `explicitly disabled. Production PG connections should use SSL — set PG_SSL=require or unset (defaults to require in production).`
    })
  }

  return issues
}

/**
 * Throws on first invocation when running with NODE_ENV=production and any
 * issue exists. In dev / test, returns the issue list for the caller to
 * surface as a warning if desired.
 */
export function assertProductionConfig(): ConfigIssue[] {
  const issues = checkProductionConfig()
  if (issues.length === 0) return issues

  if (isProduction()) {
    const banner = [
      '',
      '═'.repeat(72),
      '[boot] FATAL · production configuration check failed:',
      ...issues.map((i) => `  · ${i.variable}: ${i.detail}`),
      '═'.repeat(72),
      ''
    ].join('\n')
    console.error(banner)
    throw new Error(`production config invalid: ${issues.map((i) => i.variable).join(', ')}`)
  }

  return issues
}
