import assert from 'node:assert/strict'
import test from 'node:test'
import { parseHitlDecision, shouldHaltCriticLoop } from './hitl-resume.js'

test('empty string is invalid', () => {
  const r = parseHitlDecision('')
  assert.equal(r.kind, 'invalid')
})

test('whitespace-only string is invalid', () => {
  const r = parseHitlDecision('   \n  ')
  assert.equal(r.kind, 'invalid')
})

test('[ACCEPTED] yields accepted directive', () => {
  const r = parseHitlDecision('[ACCEPTED]')
  assert.equal(r.kind, 'accepted')
  assert.equal(shouldHaltCriticLoop(r), true)
})

test('[ACCEPTED] tolerates trailing text', () => {
  const r = parseHitlDecision('[ACCEPTED] looks good!')
  assert.equal(r.kind, 'accepted')
})

test('[REJECTED] yields rejected directive', () => {
  const r = parseHitlDecision('[REJECTED]')
  assert.equal(r.kind, 'rejected')
  assert.equal(shouldHaltCriticLoop(r), true)
})

test('[EDIT_PLAN] without dimension keeps full revision scope', () => {
  const r = parseHitlDecision('[EDIT_PLAN]: 整体调整成本测算')
  assert.equal(r.kind, 'edit_plan')
  if (r.kind !== 'edit_plan') return
  assert.equal(r.dimension, null)
  assert.equal(r.body, '整体调整成本测算')
  assert.equal(shouldHaltCriticLoop(r), false)
})

test('[EDIT_PLAN] without body is invalid', () => {
  const r = parseHitlDecision('[EDIT_PLAN]:')
  assert.equal(r.kind, 'invalid')
})

test('[EDIT_PLAN][客户细分]: <body> scopes revision to that dim (Chinese label)', () => {
  const r = parseHitlDecision('[EDIT_PLAN][客户细分]: 把目标用户从 18-24 扩到 18-35')
  assert.equal(r.kind, 'edit_plan')
  if (r.kind !== 'edit_plan') return
  assert.equal(r.dimension, '客户细分')
  assert.equal(r.body, '把目标用户从 18-24 扩到 18-35')
})

test('[EDIT_PLAN][customer-segments]: <body> accepts kebab-case English alias', () => {
  const r = parseHitlDecision('[EDIT_PLAN][customer-segments]: widen the target')
  assert.equal(r.kind, 'edit_plan')
  if (r.kind !== 'edit_plan') return
  assert.equal(r.dimension, '客户细分')
  assert.equal(r.body, 'widen the target')
})

test('[EDIT_PLAN][CHANNELS]: case-insensitive English alias', () => {
  const r = parseHitlDecision('[EDIT_PLAN][CHANNELS]: tweak channel mix')
  assert.equal(r.kind, 'edit_plan')
  if (r.kind !== 'edit_plan') return
  assert.equal(r.dimension, '渠道通路')
})

test('[EDIT_PLAN][unknown-dim]: <body> is invalid', () => {
  const r = parseHitlDecision('[EDIT_PLAN][not-a-real-dim]: anything')
  assert.equal(r.kind, 'invalid')
  if (r.kind !== 'invalid') return
  assert.match(r.reason, /unknown BMC dimension/)
})

test('[EDIT_PLAN][价值主张] empty body is invalid', () => {
  const r = parseHitlDecision('[EDIT_PLAN][价值主张]:')
  assert.equal(r.kind, 'invalid')
})

test('all 9 canonical Chinese BMC labels parse', () => {
  const labels = [
    '客户细分', '客户关系', '渠道通路', '价值主张', '收入来源',
    '关键业务', '核心资源', '重要合作', '成本结构'
  ]
  for (const label of labels) {
    const r = parseHitlDecision(`[EDIT_PLAN][${label}]: hi`)
    assert.equal(r.kind, 'edit_plan', `expected ${label} to parse`)
  }
})

test('decision not starting with a recognized prefix is invalid', () => {
  const r = parseHitlDecision('looks good to me')
  assert.equal(r.kind, 'invalid')
})

test('whitespace inside brackets is tolerated', () => {
  const r = parseHitlDecision('[EDIT_PLAN][  客户细分  ]:  body  ')
  assert.equal(r.kind, 'edit_plan')
  if (r.kind !== 'edit_plan') return
  assert.equal(r.dimension, '客户细分')
  assert.equal(r.body, 'body')
})
