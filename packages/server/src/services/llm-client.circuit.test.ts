/**
 * P11.18 · LLM circuit breaker state machine tests.
 *
 * Verifies CLOSED → OPEN → HALF-OPEN → CLOSED/OPEN transitions
 * without making real network calls — we drive the breaker by
 * stubbing fetch to fail consecutively.
 *
 * Why test the breaker: a regression here means a downstream LLM
 * outage stampedes our gateway with retries × 9 cells × 60s timeouts
 * before any user-facing error surfaces.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LLMClient, __resetLLMCircuitsForTest } from './llm-client.js'

const ORIGINAL_FETCH = globalThis.fetch
const ORIGINAL_THRESHOLD = process.env.LLM_CIRCUIT_THRESHOLD
const ORIGINAL_COOLDOWN = process.env.LLM_CIRCUIT_COOLDOWN_MS
const ORIGINAL_TIMEOUT = process.env.LLM_TIMEOUT_MS
const ORIGINAL_MAX_RETRIES = process.env.LLM_MAX_RETRIES

function setupBreaker(threshold = 3, cooldownMs = 100) {
  process.env.LLM_CIRCUIT_THRESHOLD = String(threshold)
  process.env.LLM_CIRCUIT_COOLDOWN_MS = String(cooldownMs)
  process.env.LLM_TIMEOUT_MS = '500'
  process.env.LLM_MAX_RETRIES = '0' // disable retries to test breaker quickly
}

function teardown() {
  globalThis.fetch = ORIGINAL_FETCH
  process.env.LLM_CIRCUIT_THRESHOLD = ORIGINAL_THRESHOLD
  process.env.LLM_CIRCUIT_COOLDOWN_MS = ORIGINAL_COOLDOWN
  process.env.LLM_TIMEOUT_MS = ORIGINAL_TIMEOUT
  process.env.LLM_MAX_RETRIES = ORIGINAL_MAX_RETRIES
  __resetLLMCircuitsForTest()
}

function stubFetchAlways500() {
  globalThis.fetch = (async () =>
    new Response('upstream down', { status: 500 })) as typeof fetch
}

function stubFetchAlwaysOK() {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: 'ok', tool_calls: [] }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )) as typeof fetch
}

test('circuit breaker · trips OPEN after N consecutive failures', async () => {
  __resetLLMCircuitsForTest()
  setupBreaker(3, 60_000)
  stubFetchAlways500()
  try {
    const client = new LLMClient({
      baseURL: 'https://breaker-test.example.com/v1',
      apiKey: 'test',
      defaultModel: 'test'
    })
    // First 3 calls hit network (fail with 500).
    for (let i = 0; i < 3; i++) {
      await assert.rejects(client.chat({ messages: [{ role: 'user', content: 'hi' }] }))
    }
    // 4th call should be rejected by breaker BEFORE fetch — message
    // includes "circuit OPEN".
    await assert.rejects(
      client.chat({ messages: [{ role: 'user', content: 'hi' }] }),
      (err: unknown) => err instanceof Error && /circuit OPEN/.test(err.message)
    )
  } finally {
    teardown()
  }
})

test('circuit breaker · transitions to HALF-OPEN after cooldown, closes on success', async () => {
  __resetLLMCircuitsForTest()
  setupBreaker(2, 50) // very short cooldown
  stubFetchAlways500()
  try {
    const client = new LLMClient({
      baseURL: 'https://breaker-recovery.example.com/v1',
      apiKey: 'test',
      defaultModel: 'test'
    })
    // Trip the breaker.
    for (let i = 0; i < 2; i++) {
      await assert.rejects(client.chat({ messages: [{ role: 'user', content: 'hi' }] }))
    }
    // Confirm OPEN.
    await assert.rejects(
      client.chat({ messages: [{ role: 'user', content: 'hi' }] }),
      (err: unknown) => err instanceof Error && /circuit OPEN/.test(err.message)
    )
    // Wait > cooldown.
    await new Promise((r) => setTimeout(r, 80))
    // Switch fetch to success — HALF-OPEN trial should pass and close.
    stubFetchAlwaysOK()
    const r = await client.chat({ messages: [{ role: 'user', content: 'hi' }] })
    assert.equal(r.content, 'ok')
    // Subsequent calls should also work (CLOSED).
    const r2 = await client.chat({ messages: [{ role: 'user', content: 'hi' }] })
    assert.equal(r2.content, 'ok')
  } finally {
    teardown()
  }
})

test('circuit breaker · per-baseURL isolation (one domain failing does not trip another)', async () => {
  __resetLLMCircuitsForTest()
  setupBreaker(2, 60_000)
  stubFetchAlways500()
  try {
    const failingClient = new LLMClient({
      baseURL: 'https://breaker-fail.example.com/v1',
      apiKey: 'test',
      defaultModel: 'test'
    })
    // Trip the failing breaker.
    for (let i = 0; i < 2; i++) {
      await assert.rejects(failingClient.chat({ messages: [{ role: 'user', content: 'hi' }] }))
    }
    // Verify it's open.
    await assert.rejects(
      failingClient.chat({ messages: [{ role: 'user', content: 'hi' }] }),
      (err: unknown) => err instanceof Error && /circuit OPEN/.test(err.message)
    )
    // Healthy client on a different baseURL should be unaffected.
    stubFetchAlwaysOK()
    const healthyClient = new LLMClient({
      baseURL: 'https://breaker-ok.example.com/v1',
      apiKey: 'test',
      defaultModel: 'test'
    })
    const r = await healthyClient.chat({ messages: [{ role: 'user', content: 'hi' }] })
    assert.equal(r.content, 'ok')
  } finally {
    teardown()
  }
})
