/**
 * Smoke test: 验证 LangSmith 配置端到端贯通
 *
 * 用法：
 *   pnpm --filter @starlink/server smoke:langsmith
 *   # 或显式：
 *   pnpm --filter @starlink/server build && node --env-file=.env dist/scripts/smoke-langsmith-config.js
 *
 * 通过条件：
 *   1. 读到 LANGSMITH_TRACING=true + 合法 API key（lsv2_ 前缀）
 *   2. 成功跑一次最小 StateGraph（不调用真实 LLM，不依赖 LLM_API_KEY）
 *   3. ~5s 后在 LangSmith UI 的 $LANGSMITH_PROJECT 项目里能看到
 *      tag=smoke-test + thread_id=smoke-test-{timestamp} 的 trace
 *
 * 不通过条件：
 *   - 上述任一缺失 → 打印诊断信息并 exit(1)
 *
 * 设计原则：
 *   - 零业务代码耦合：不引入 services/business-langgraph.ts
 *   - 零 LLM 依赖：纯 Annotation + reducer，不发网络请求到 OpenAI/SiliconFlow
 *   - 可在 LANGSMITH_TRACING=false 时跑 → 只验证配置，不做 egress
 */
import { Annotation, StateGraph, START, END } from '@langchain/langgraph'

interface Diagnostics {
  tracing: boolean
  hasApiKey: boolean
  apiKeyPrefix: string | null
  project: string
  endpoint: string
  sampleRate: string | undefined
  backend: string
}

function readDiagnostics(): Diagnostics {
  const apiKey = process.env.LANGSMITH_API_KEY ?? ''
  return {
    tracing: process.env.LANGSMITH_TRACING === 'true',
    hasApiKey: apiKey.length > 0,
    apiKeyPrefix: apiKey.length >= 6 ? apiKey.slice(0, 6) + '…' : null,
    project: process.env.LANGSMITH_PROJECT ?? 'starlink-bmc-dev',
    endpoint: process.env.LANGSMITH_ENDPOINT ?? 'https://api.smith.langchain.com',
    sampleRate: process.env.LANGSMITH_SAMPLING_RATE,
    backend: process.env.TRACE_BACKEND ?? 'langsmith',
  }
}

function validate(diag: Diagnostics): void {
  console.log('[smoke-langsmith] 当前配置：')
  console.log(`  LANGSMITH_TRACING       = ${diag.tracing}`)
  console.log(`  LANGSMITH_API_KEY       = ${diag.hasApiKey ? diag.apiKeyPrefix : '(空)'}`)
  console.log(`  LANGSMITH_PROJECT       = ${diag.project}`)
  console.log(`  LANGSMITH_ENDPOINT      = ${diag.endpoint}`)
  console.log(`  LANGSMITH_SAMPLING_RATE = ${diag.sampleRate ?? '(未设 · 默认 1.0)'}`)
  console.log(`  TRACE_BACKEND           = ${diag.backend}`)
  console.log('')

  if (!diag.tracing) {
    console.log('[smoke-langsmith] LANGSMITH_TRACING !== "true" — 仅做配置校验，不做 egress')
    return
  }
  if (!diag.hasApiKey) {
    console.error('[smoke-langsmith] ❌ LANGSMITH_TRACING=true 但 LANGSMITH_API_KEY 缺失')
    console.error('  请在 packages/server/.env 里设置 LANGSMITH_API_KEY=lsv2_pt_...')
    process.exit(1)
  }
  if (!process.env.LANGSMITH_API_KEY?.startsWith('lsv2_')) {
    console.warn('[smoke-langsmith] ⚠ LANGSMITH_API_KEY 不以 "lsv2_" 开头，格式可能异常')
  }
  if (diag.backend !== 'langsmith') {
    console.warn(`[smoke-langsmith] ⚠ TRACE_BACKEND=${diag.backend}，Day-1a 仅支持 langsmith`)
  }
}

async function runMinimalGraph(threadId: string): Promise<string> {
  const State = Annotation.Root({
    ping: Annotation<string>({
      reducer: (_, next) => next,
      default: () => 'pong',
    }),
  })

  const graph = new StateGraph(State)
    .addNode('echo', async (s) => ({ ping: `${s.ping}!` }))
    .addEdge(START, 'echo')
    .addEdge('echo', END)
    .compile()

  const result = await graph.invoke(
    { ping: 'hello' },
    {
      configurable: { thread_id: threadId },
      tags: ['smoke-test', 'langsmith-day1'],
      metadata: { script: 'smoke-langsmith-config', ts: new Date().toISOString() },
    },
  )

  return String(result.ping)
}

async function main() {
  const diag = readDiagnostics()
  validate(diag)

  const threadId = `smoke-test-${Date.now()}`
  console.log(`[smoke-langsmith] 运行最小 StateGraph，thread_id=${threadId} ...`)
  const out = await runMinimalGraph(threadId)
  console.log(`[smoke-langsmith] graph.invoke 成功 → ping="${out}"`)

  if (diag.tracing) {
    const uiBase = diag.endpoint.includes('eu.api')
      ? 'https://eu.smith.langchain.com'
      : 'https://smith.langchain.com'
    console.log('')
    console.log(`[smoke-langsmith] ✅ 5 秒后检查：`)
    console.log(`  ${uiBase} → 项目 "${diag.project}" → Threads 标签`)
    console.log(`  → 查找 thread_id = ${threadId}（含 tag: smoke-test, langsmith-day1）`)
  } else {
    console.log('[smoke-langsmith] ✅ 配置校验通过（未启用 tracing）')
  }
}

main().catch((err) => {
  console.error('[smoke-langsmith] 失败：', err)
  process.exit(1)
})
