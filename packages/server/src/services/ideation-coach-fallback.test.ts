/**
 * commit f6276c6 · reflectionFallback regression tests.
 *
 * The user observed that when the coach LLM call failed, the fallback
 * returned generic templates like "记下这个节点了 ✓ / 你打算怎么解释
 * 它和你已有节点的关系" — totally context-free.
 *
 * The new fallback must (a) prepend a degraded-mode banner, (b) reference
 * the actual event payload (node label / from-to kinds / canvas counts /
 * user message head). These tests pin the new shape so it doesn't drift.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { reflectionFallback } from './ideation-coach-service.js'
import type { ReflectionRequest } from '@starlink/shared'

const BANNER = 'AI 教练暂时不可达'

function baseCanvas(): ReflectionRequest['canvas'] {
  return {
    nodes: [],
    edgeCount: 0,
    nodeCountByKind: {}
  }
}

test('reflectionFallback · banner is always present (degraded-mode signal)', () => {
  const req: ReflectionRequest = {
    event: { type: 'meta-check' },
    canvas: baseCanvas(),
    recentChat: [],
    firedMetaIds: []
  }
  const out = reflectionFallback(req, 100)
  assert.match(out.content, new RegExp(BANNER), 'banner missing — user would think LLM is healthy')
  assert.equal(out.source, 'error', 'source=error preserves the chat-bubble warning tint')
})

test('reflectionFallback · node-added references the actual label + kind', () => {
  const req: ReflectionRequest = {
    event: {
      type: 'node-added',
      kind: 'customer-pain',
      label: '设计师找图浪费 30% 时间'
    },
    canvas: baseCanvas(),
    recentChat: [],
    firedMetaIds: []
  }
  const out = reflectionFallback(req, 100)
  // Must contain the label so the user knows the fallback is anchored
  // to what they just added — not a generic "已有节点" template.
  assert.match(
    out.content,
    /设计师找图浪费 30% 时间/,
    'fallback must reference the just-added node label'
  )
  assert.match(out.content, /customer-pain/, 'fallback must reference the node kind')
  assert.equal(out.scaffold, 'why')
  // Must NOT contain the old generic phrasing — that's what we fixed.
  assert.doesNotMatch(
    out.content,
    /你打算怎么解释它和你已有节点的关系/,
    'old generic phrasing must be removed'
  )
})

test('reflectionFallback · node-linked references both from/to kinds', () => {
  const req: ReflectionRequest = {
    event: {
      type: 'node-linked',
      fromKind: 'customer-pain',
      toKind: 'value-angle'
    },
    canvas: baseCanvas(),
    recentChat: [],
    firedMetaIds: []
  }
  const out = reflectionFallback(req, 100)
  assert.match(out.content, /customer-pain/, 'fallback must reference fromKind')
  assert.match(out.content, /value-angle/, 'fallback must reference toKind')
  // Must NOT say generic "两个节点".
  assert.doesNotMatch(out.content, /两个节点/, 'old generic phrasing must be removed')
})

test('reflectionFallback · meta-check summarizes canvas counts when present', () => {
  const req: ReflectionRequest = {
    event: { type: 'meta-check' },
    canvas: {
      nodes: [],
      edgeCount: 3,
      nodeCountByKind: { 'cc-bmc-card': 5, 'insight-note': 2 }
    },
    recentChat: [],
    firedMetaIds: []
  }
  const out = reflectionFallback(req, 100)
  assert.match(out.content, /cc-bmc-card=5/, 'should expose nodeCountByKind')
  assert.match(out.content, /insight-note=2/, 'should expose all populated counts')
  assert.equal(out.scaffold, 'meta')
})

test('reflectionFallback · user-message echoes the user input head', () => {
  const said = '我想做一个面向独立设计师的 AI 工具'
  const req: ReflectionRequest = {
    event: { type: 'user-message', label: said },
    canvas: baseCanvas(),
    recentChat: [],
    firedMetaIds: []
  }
  const out = reflectionFallback(req, 100)
  assert.match(out.content, /独立设计师 的 AI 工具|独立设计师的 AI 工具/, 'should echo user message head')
})
