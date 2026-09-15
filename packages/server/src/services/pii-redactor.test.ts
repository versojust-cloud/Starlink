import assert from 'node:assert/strict'
import test from 'node:test'
import { redactPii } from './pii-redactor.js'

test('redactPii: leaves clean text unchanged', () => {
  const result = redactPii('5 years B2B SaaS background; tends to skip risk analysis')
  assert.equal(result.applied, false)
  assert.equal(result.redacted, '5 years B2B SaaS background; tends to skip risk analysis')
})

test('redactPii: redacts email', () => {
  const result = redactPii('contact: john.doe+test@example.com please')
  assert.equal(result.counts.EMAIL, 1)
  assert.match(result.redacted, /\[REDACTED:EMAIL\]/)
  assert.doesNotMatch(result.redacted, /example\.com/)
})

test('redactPii: redacts Chinese mainland mobile', () => {
  const result = redactPii('phone 13800138000 customer support')
  assert.equal(result.counts.PHONE_CN, 1)
  assert.match(result.redacted, /\[REDACTED:PHONE_CN\]/)
  assert.doesNotMatch(result.redacted, /138001/)
})

test('redactPii: does NOT match a non-mobile 11-digit number', () => {
  // 12000000000 doesn't start with 1[3-9], so should pass through
  const result = redactPii('count: 22000000000 records')
  assert.equal(result.applied, false)
})

test('redactPii: redacts Chinese national ID', () => {
  const result = redactPii('the id is 110101199001011234 yes')
  assert.equal(result.counts.ID_CN, 1)
  assert.match(result.redacted, /\[REDACTED:ID_CN\]/)
})

test('redactPii: redacts IP address', () => {
  const result = redactPii('server at 192.168.1.100 listening')
  assert.equal(result.counts.IP_V4, 1)
  assert.doesNotMatch(result.redacted, /192\.168/)
})

test('redactPii: redacts URL', () => {
  const result = redactPii('see https://example.com/secret?token=abc for details')
  assert.equal(result.counts.URL, 1)
  assert.doesNotMatch(result.redacted, /token=/)
})

test('redactPii: counts each kind separately', () => {
  const result = redactPii(
    'reach me at john@x.com or 13800138000 from 192.168.1.1'
  )
  assert.equal(result.counts.EMAIL, 1)
  assert.equal(result.counts.PHONE_CN, 1)
  assert.equal(result.counts.IP_V4, 1)
  assert.equal(result.applied, true)
})

test('redactPii: idempotent on already-redacted text', () => {
  const once = redactPii('phone 13800138000')
  const twice = redactPii(once.redacted)
  assert.equal(once.redacted, twice.redacted)
})
