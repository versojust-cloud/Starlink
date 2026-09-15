/**
 * P11.18 · LLMClient.streamChat unit tests.
 *
 * Verifies the SSE parser handles:
 *   - delta token frames
 *   - boundary across chunks (frame split mid-buffer)
 *   - finish_reason + usage in final frame
 *   - [DONE] sentinel
 *   - HTTP error status -> emits `error` event
 *   - malformed JSON frames -> tolerated
 */

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { LLMClient, __resetLLMCircuitsForTest } from './llm-client.js'

const ORIGINAL_FETCH = globalThis.fetch

beforeEach(() => {
  __resetLLMCircuitsForTest()
})

function sseStream(frames: string[]): Response {
  // Build a ReadableStream that emits the given SSE frames as separate
  // Uint8Array chunks (so we exercise the cross-chunk boundary logic).
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      for (const f of frames) controller.enqueue(encoder.encode(f))
      controller.close()
    }
  })
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' }
  })
}

function makeChunk(content: string, finish?: string, usage?: object): string {
  const choice: Record<string, unknown> = { delta: { content } }
  if (finish !== undefined) choice.finish_reason = finish
  const json: Record<string, unknown> = { choices: [choice] }
  if (usage) json.usage = usage
  return `data: ${JSON.stringify(json)}\n\n`
}

test('streamChat: yields token + done with concatenated text', async () => {
  globalThis.fetch = (async () => sseStream([
    makeChunk('Hello'),
    makeChunk(' world'),
    makeChunk('!'),
    makeChunk('', 'stop', { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 }),
    'data: [DONE]\n\n'
  ])) as typeof fetch

  const client = new LLMClient({ baseURL: 'https://stream.example.com/v1', apiKey: 'k', defaultModel: 'm' })
  const tokens: string[] = []
  let done: { fullText: string; finishReason: string; usage?: { totalTokens: number } } | null = null
  for await (const evt of client.streamChat({ messages: [{ role: 'user', content: 'hi' }] })) {
    if (evt.kind === 'token') tokens.push(evt.delta)
    if (evt.kind === 'done') done = evt
  }
  assert.deepEqual(tokens, ['Hello', ' world', '!'])
  assert.equal(done?.fullText, 'Hello world!')
  assert.equal(done?.finishReason, 'stop')
  assert.equal(done?.usage?.totalTokens, 8)
  globalThis.fetch = ORIGINAL_FETCH
})

test('streamChat: handles SSE frame split across multiple chunks', async () => {
  // First half of frame, then rest — exercises buffer logic.
  const frame1 = `data: ${JSON.stringify({ choices: [{ delta: { content: 'split-' } }] })}`
  const frame2 = `\n\ndata: ${JSON.stringify({ choices: [{ delta: { content: 'token' } }] })}\n\n`
  globalThis.fetch = (async () => sseStream([frame1, frame2])) as typeof fetch

  const client = new LLMClient({ baseURL: 'https://stream-split.example.com/v1', apiKey: 'k' })
  const tokens: string[] = []
  for await (const evt of client.streamChat({ messages: [{ role: 'user', content: 'x' }] })) {
    if (evt.kind === 'token') tokens.push(evt.delta)
  }
  assert.deepEqual(tokens, ['split-', 'token'])
  globalThis.fetch = ORIGINAL_FETCH
})

test('streamChat: tolerates malformed JSON frames without breaking', async () => {
  globalThis.fetch = (async () => sseStream([
    makeChunk('first '),
    'data: this-is-not-json\n\n',
    makeChunk('second'),
    'data: [DONE]\n\n'
  ])) as typeof fetch

  const client = new LLMClient({ baseURL: 'https://stream-malformed.example.com/v1', apiKey: 'k' })
  const tokens: string[] = []
  let doneEvt: { fullText: string } | null = null
  for await (const evt of client.streamChat({ messages: [{ role: 'user', content: 'x' }] })) {
    if (evt.kind === 'token') tokens.push(evt.delta)
    if (evt.kind === 'done') doneEvt = evt
  }
  assert.deepEqual(tokens, ['first ', 'second'])
  assert.equal(doneEvt?.fullText, 'first second')
  globalThis.fetch = ORIGINAL_FETCH
})

test('streamChat: HTTP 500 yields error event', async () => {
  globalThis.fetch = (async () =>
    new Response('upstream broken', { status: 500 })) as typeof fetch

  const client = new LLMClient({ baseURL: 'https://stream-500.example.com/v1', apiKey: 'k' })
  let errSeen = false
  for await (const evt of client.streamChat({ messages: [{ role: 'user', content: 'x' }] })) {
    if (evt.kind === 'error') {
      errSeen = true
      assert.match(evt.error, /500/)
    }
  }
  assert.equal(errSeen, true)
  globalThis.fetch = ORIGINAL_FETCH
})

test('streamChat: empty content delta is skipped (no zero-length tokens)', async () => {
  globalThis.fetch = (async () => sseStream([
    makeChunk(''),       // skipped
    makeChunk('hi'),
    makeChunk(''),       // skipped
    'data: [DONE]\n\n'
  ])) as typeof fetch

  const client = new LLMClient({ baseURL: 'https://stream-empty.example.com/v1', apiKey: 'k' })
  const tokens: string[] = []
  for await (const evt of client.streamChat({ messages: [{ role: 'user', content: 'x' }] })) {
    if (evt.kind === 'token') tokens.push(evt.delta)
  }
  assert.deepEqual(tokens, ['hi'])
  globalThis.fetch = ORIGINAL_FETCH
})
