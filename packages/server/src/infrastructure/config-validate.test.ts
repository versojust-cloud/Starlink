import assert from 'node:assert/strict'
import test from 'node:test'
import { checkProductionConfig } from './config-validate.js'

/**
 * Baseline env that satisfies every production gate. Tests opt-out of
 * specific keys (set to undefined) to assert that single-issue detection
 * still works. Keep this in sync with PROD_REQUIRED in config-validate.ts.
 */
const VALID_BASELINE: Record<string, string> = {
  DATABASE_URL: 'postgres://u:p@h:5432/d',
  INTERNAL_SERVICE_TOKEN: 'a'.repeat(40),
  AUTH_MODE: 'jwt',
  AUTH_JWT_SECRET: 'b'.repeat(48),
  EMBEDDING_API_KEY: 'sk-test-' + 'c'.repeat(40),
  USER_SKILL_ENCRYPTION_KEY: 'd'.repeat(48)
}

function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T): T {
  // Always start from the valid baseline so each test only opts out of
  // the keys it cares about. Otherwise newly-added gates break old tests.
  const merged: Record<string, string | undefined> = { ...VALID_BASELINE, ...overrides }
  const restore: Array<() => void> = []
  for (const [key, value] of Object.entries(merged)) {
    const original = process.env[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
    restore.push(() => {
      if (original === undefined) delete process.env[key]
      else process.env[key] = original
    })
  }
  // Also clear any env vars that are forbidden in production (e.g. local-hash)
  // so the baseline stays clean unless the test explicitly sets them.
  for (const k of ['EMBEDDING_PROVIDER', 'PG_SSL']) {
    if (overrides[k] === undefined && !(k in overrides)) {
      const original = process.env[k]
      delete process.env[k]
      restore.push(() => {
        if (original === undefined) delete process.env[k]
        else process.env[k] = original
      })
    }
  }
  try {
    return fn()
  } finally {
    for (const r of restore.reverse()) r()
  }
}

test('checkProductionConfig: clean valid config returns no issues', () => {
  const issues = withEnv(
    {
      DATABASE_URL: 'postgres://u:p@h:5432/d',
      INTERNAL_SERVICE_TOKEN: 'a'.repeat(40),
      AUTH_MODE: 'jwt',
      AUTH_JWT_SECRET: 'b'.repeat(48)
    },
    checkProductionConfig
  )
  assert.deepEqual(issues, [])
})

test('checkProductionConfig: missing DATABASE_URL is flagged', () => {
  const issues = withEnv(
    {
      DATABASE_URL: undefined,
      INTERNAL_SERVICE_TOKEN: 'a'.repeat(40),
      AUTH_MODE: 'jwt',
      AUTH_JWT_SECRET: 'b'.repeat(48)
    },
    checkProductionConfig
  )
  assert.equal(issues.length, 1)
  assert.equal(issues[0]?.variable, 'DATABASE_URL')
})

test('checkProductionConfig: change-me placeholder is rejected as INTERNAL_SERVICE_TOKEN', () => {
  const issues = withEnv(
    {
      DATABASE_URL: 'postgres://u:p@h:5432/d',
      INTERNAL_SERVICE_TOKEN: 'change-me',
      AUTH_MODE: 'jwt',
      AUTH_JWT_SECRET: 'b'.repeat(48)
    },
    checkProductionConfig
  )
  assert.equal(issues.length, 1)
  assert.equal(issues[0]?.variable, 'INTERNAL_SERVICE_TOKEN')
  assert.match(issues[0]!.detail, /placeholder/)
})

test('checkProductionConfig: AUTH_MODE=disabled is flagged in production', () => {
  const issues = withEnv(
    {
      DATABASE_URL: 'postgres://u:p@h:5432/d',
      INTERNAL_SERVICE_TOKEN: 'a'.repeat(40),
      AUTH_MODE: 'disabled',
      AUTH_JWT_SECRET: undefined
    },
    checkProductionConfig
  )
  assert.equal(issues.length, 1)
  assert.equal(issues[0]?.variable, 'AUTH_MODE')
})

test('checkProductionConfig: AUTH_MODE=jwt with short secret is flagged', () => {
  const issues = withEnv(
    {
      DATABASE_URL: 'postgres://u:p@h:5432/d',
      INTERNAL_SERVICE_TOKEN: 'a'.repeat(40),
      AUTH_MODE: 'jwt',
      AUTH_JWT_SECRET: 'too-short'
    },
    checkProductionConfig
  )
  assert.equal(issues.length, 1)
  assert.equal(issues[0]?.variable, 'AUTH_JWT_SECRET')
  assert.match(issues[0]!.detail, /32 chars/)
})

test('checkProductionConfig: empty INTERNAL_SERVICE_TOKEN is flagged (security hole at internal-task-events.ts:10)', () => {
  const issues = withEnv(
    {
      DATABASE_URL: 'postgres://u:p@h:5432/d',
      INTERNAL_SERVICE_TOKEN: '',
      AUTH_MODE: 'jwt',
      AUTH_JWT_SECRET: 'b'.repeat(48)
    },
    checkProductionConfig
  )
  assert.equal(issues.length, 1)
  assert.equal(issues[0]?.variable, 'INTERNAL_SERVICE_TOKEN')
})

test('checkProductionConfig: multiple issues all reported', () => {
  const issues = withEnv(
    {
      DATABASE_URL: undefined,
      INTERNAL_SERVICE_TOKEN: 'change-me',
      AUTH_MODE: 'disabled',
      AUTH_JWT_SECRET: undefined
    },
    checkProductionConfig
  )
  // The 3 originally-tested gates should all be present (other newly
  // added gates remain valid via the baseline).
  const vars = new Set(issues.map((i) => i.variable))
  assert.ok(vars.has('AUTH_MODE'), 'AUTH_MODE should be flagged')
  assert.ok(vars.has('DATABASE_URL'), 'DATABASE_URL should be flagged')
  assert.ok(vars.has('INTERNAL_SERVICE_TOKEN'), 'INTERNAL_SERVICE_TOKEN should be flagged')
})

test('checkProductionConfig: missing EMBEDDING_API_KEY is flagged', () => {
  const issues = withEnv(
    {
      EMBEDDING_API_KEY: undefined,
      OPENAI_API_KEY: undefined,
      LLM_API_KEY: undefined
    },
    checkProductionConfig
  )
  assert.equal(issues.length, 1)
  assert.equal(issues[0]?.variable, 'EMBEDDING_API_KEY')
})

test('checkProductionConfig: EMBEDDING_PROVIDER=local-hash is flagged', () => {
  const issues = withEnv({ EMBEDDING_PROVIDER: 'local-hash' }, checkProductionConfig)
  assert.equal(issues.length, 1)
  assert.equal(issues[0]?.variable, 'EMBEDDING_PROVIDER')
})

test('checkProductionConfig: missing USER_SKILL_ENCRYPTION_KEY is flagged', () => {
  const issues = withEnv({ USER_SKILL_ENCRYPTION_KEY: undefined }, checkProductionConfig)
  assert.equal(issues.length, 1)
  assert.equal(issues[0]?.variable, 'USER_SKILL_ENCRYPTION_KEY')
})

test('checkProductionConfig: PG_SSL=disable is flagged', () => {
  const issues = withEnv({ PG_SSL: 'disable' }, checkProductionConfig)
  assert.equal(issues.length, 1)
  assert.equal(issues[0]?.variable, 'PG_SSL')
})
