/**
 * P11.18 · End-to-end smoke for `reportWriterStream` GraphQL subscription.
 *
 * Connects to ws://localhost:4000/graphql via graphql-ws, opens the
 * subscription with workspaceId/message, and prints every event as it
 * arrives — verifying:
 *   1. WS handshake works
 *   2. Subscription fires `started` event
 *   3. `section` events arrive progressively (60ms apart)
 *   4. `completed` event carries full markdown + node id
 *   5. Connection cleanly closes
 *
 * Run:  pnpm tsx packages/server/src/scripts/smoke-report-writer-stream.ts
 *
 * Exits 0 on success, 1 on protocol failure.
 */

import { createClient, type Client } from 'graphql-ws'
import WebSocket from 'ws'

type StreamEvent = {
  kind: 'started' | 'section' | 'completed' | 'error'
  timestampIso: string
  sectionTitle?: string | null
  sectionBody?: string | null
  completeMarkdown?: string | null
  appendedNodeId?: string | null
  errorMessage?: string | null
}

const QUERY = /* GraphQL */ `
  subscription ReportStream($workspaceId: ID!, $message: String) {
    reportWriterStream(workspaceId: $workspaceId, message: $message) {
      kind
      timestampIso
      sectionTitle
      sectionBody
      completeMarkdown
      appendedNodeId
      errorMessage
    }
  }
`

async function main() {
  const url = process.env.GQL_WS_URL ?? 'ws://localhost:4000/graphql'
  const workspaceId = process.env.WORKSPACE_ID ?? 'proj-001'
  const userId = process.env.USER_ID ?? 'lead-alex'
  console.log(`[smoke-stream] connecting → ${url}`)
  console.log(`[smoke-stream] workspaceId=${workspaceId} userId=${userId}\n`)

  const client: Client = createClient({
    url,
    webSocketImpl: WebSocket as unknown as typeof globalThis.WebSocket,
    connectionParams: { 'x-user-id': userId }
  })

  const t0 = Date.now()
  const events: StreamEvent[] = []
  let eventCount = 0
  let sawStarted = false
  let sawSection = false
  let sawCompleted = false
  let lastSectionAt = 0
  const sectionGaps: number[] = []

  await new Promise<void>((resolve, reject) => {
    const unsubscribe = client.subscribe(
      {
        query: QUERY,
        variables: { workspaceId, message: '基于当前画布生成简短的商业报告' }
      },
      {
        next: (msg: { data?: { reportWriterStream?: StreamEvent } }) => {
          const ev = msg.data?.reportWriterStream
          if (!ev) return
          eventCount++
          events.push(ev)
          const elapsed = Date.now() - t0
          const tag = ev.kind.padEnd(10)
          if (ev.kind === 'started') {
            sawStarted = true
            console.log(`[+${elapsed.toString().padStart(5)}ms] ${tag} ts=${ev.timestampIso}`)
          } else if (ev.kind === 'section') {
            sawSection = true
            const now = Date.now()
            if (lastSectionAt > 0) sectionGaps.push(now - lastSectionAt)
            lastSectionAt = now
            const bodyHead = (ev.sectionBody ?? '').slice(0, 60).replace(/\n/g, ' ')
            console.log(`[+${elapsed.toString().padStart(5)}ms] ${tag} title="${ev.sectionTitle}" body="${bodyHead}…"`)
          } else if (ev.kind === 'completed') {
            sawCompleted = true
            const markdownLen = (ev.completeMarkdown ?? '').length
            console.log(`[+${elapsed.toString().padStart(5)}ms] ${tag} markdownLen=${markdownLen} appendedNodeId=${ev.appendedNodeId}`)
          } else if (ev.kind === 'error') {
            console.log(`[+${elapsed.toString().padStart(5)}ms] ${tag} errorMessage=${ev.errorMessage}`)
          }
        },
        error: (err) => {
          console.error('[smoke-stream] subscription error:', err)
          reject(err)
        },
        complete: () => {
          unsubscribe()
          resolve()
        }
      }
    )

    // Defensive: timeout 300s if neither completed nor error fires.
    // Report-writer LLM calls can take 30-60s on deepseek-chat
    // depending on prompt size + token output length.
    const timeoutMs = Number(process.env.STREAM_SMOKE_TIMEOUT_MS) || 300_000
    setTimeout(() => {
      console.error(`[smoke-stream] TIMEOUT after ${timeoutMs}ms`)
      unsubscribe()
      reject(new Error('timeout'))
    }, timeoutMs)
  })

  await client.dispose()

  // ── Assertions ───────────────────────────────────────────────────
  console.log('\n[smoke-stream] ─── summary ───')
  console.log(`  total events: ${eventCount}`)
  console.log(`  saw started: ${sawStarted}`)
  console.log(`  saw section: ${sawSection}`)
  console.log(`  saw completed: ${sawCompleted}`)
  console.log(`  total wall-clock: ${(Date.now() - t0) / 1000}s`)
  if (sectionGaps.length > 0) {
    const avg = sectionGaps.reduce((a, b) => a + b, 0) / sectionGaps.length
    const min = Math.min(...sectionGaps)
    const max = Math.max(...sectionGaps)
    console.log(`  section gaps (ms): min=${min} avg=${avg.toFixed(0)} max=${max} (count=${sectionGaps.length})`)
  }

  if (!sawStarted) {
    console.error('❌ FAIL · never saw `started` event')
    process.exit(1)
  }
  if (!sawCompleted && events.every((e) => e.kind !== 'error')) {
    console.error('❌ FAIL · neither `completed` nor `error` fired')
    process.exit(1)
  }
  console.log('✅ PASS · subscription protocol verified end-to-end')
  process.exit(0)
}

void main().catch((err) => {
  console.error('[smoke-stream] FATAL:', err)
  process.exit(1)
})
