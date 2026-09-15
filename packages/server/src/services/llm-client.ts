/**
 * Unified LLM Client — wraps OpenAI-compatible chat completion APIs.
 * Supports function calling (tool use), streaming, and configurable providers.
 */

export interface LLMToolSchema {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface LLMToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: LLMToolCall[]
  tool_call_id?: string
}

export interface LLMResponse {
  content: string | null
  toolCalls: LLMToolCall[]
  finishReason: string
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
}

export interface LLMChatOptions {
  messages: LLMMessage[]
  tools?: LLMToolSchema[]
  model?: string
  temperature?: number
  maxTokens?: number
}

/**
 * P11.18 · process-wide circuit breaker per (baseURL).
 *
 * State machine:
 *   CLOSED   ─(N consecutive failures)─→ OPEN
 *   OPEN     ─(cooldown elapsed)──────→ HALF-OPEN
 *   HALF-OPEN ─(1 success)───────────→ CLOSED
 *   HALF-OPEN ─(any failure)─────────→ OPEN (re-arm cooldown)
 *
 * When OPEN, chat() throws immediately without hitting the network —
 * protects upstream from a stampede when an LLM provider is down +
 * gives downstream code (mention-router chatFallback, agent-degraded
 * handoff) a chance to surface "LLM unavailable" instead of repeated
 * timeouts. Threshold = 5 consecutive failures, cooldown = 5 min.
 * Tunable via LLM_CIRCUIT_THRESHOLD / LLM_CIRCUIT_COOLDOWN_MS env.
 */
type CircuitState = 'closed' | 'open' | 'half-open'
interface Circuit {
  state: CircuitState
  consecutiveFailures: number
  openedAt: number
}
const circuitsByBaseURL = new Map<string, Circuit>()

// Read env on each access so tests (and runtime config flips) take effect
// without a process restart. The Number() coerces a missing/blank env
// var to NaN; the fallback `||` treats that as "use the default".
function getCircuitThreshold(): number {
  return Number(process.env.LLM_CIRCUIT_THRESHOLD) || 5
}
function getCircuitCooldownMs(): number {
  return Number(process.env.LLM_CIRCUIT_COOLDOWN_MS) || 5 * 60 * 1000
}

function getCircuit(baseURL: string): Circuit {
  let c = circuitsByBaseURL.get(baseURL)
  if (!c) {
    c = { state: 'closed', consecutiveFailures: 0, openedAt: 0 }
    circuitsByBaseURL.set(baseURL, c)
  }
  return c
}

function checkCircuitOpen(baseURL: string): void {
  const c = getCircuit(baseURL)
  if (c.state === 'open') {
    const elapsed = Date.now() - c.openedAt
    const cooldown = getCircuitCooldownMs()
    if (elapsed < cooldown) {
      const remainingS = Math.ceil((cooldown - elapsed) / 1000)
      throw new Error(
        `LLM circuit OPEN for ${baseURL} (${c.consecutiveFailures} consecutive failures, retry in ${remainingS}s)`
      )
    }
    // Cooldown elapsed → half-open: allow one trial call.
    c.state = 'half-open'
  }
}

function recordSuccess(baseURL: string): void {
  const c = getCircuit(baseURL)
  c.consecutiveFailures = 0
  c.state = 'closed'
}

function recordFailure(baseURL: string): void {
  const c = getCircuit(baseURL)
  c.consecutiveFailures += 1
  if (c.state === 'half-open') {
    // Trial call failed → re-open immediately.
    c.state = 'open'
    c.openedAt = Date.now()
    console.warn(`[llm-client] circuit re-OPENED for ${baseURL} after half-open trial failure`)
    return
  }
  if (c.state === 'closed' && c.consecutiveFailures >= getCircuitThreshold()) {
    c.state = 'open'
    c.openedAt = Date.now()
    console.warn(
      `[llm-client] circuit OPENED for ${baseURL} (${c.consecutiveFailures} consecutive failures, cooldown ${getCircuitCooldownMs() / 1000}s)`
    )
  }
}

/** Test/admin escape hatch — force-close all circuits. */
export function __resetLLMCircuitsForTest(): void {
  circuitsByBaseURL.clear()
}

export class LLMClient {
  private baseURL: string
  private apiKey: string
  private defaultModel: string

  constructor(options?: { baseURL?: string; apiKey?: string; defaultModel?: string }) {
    this.baseURL = options?.baseURL ?? process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1'
    this.apiKey = options?.apiKey ?? process.env.LLM_API_KEY ?? ''
    // P11.18 · pick a sensible default by sniffing baseURL — saves 16+
    // dimension-action callers from hardcoding `model:` themselves.
    // OpenAI baseURL → gpt-4o-mini; DeepSeek → deepseek-chat;
    // SiliconFlow → Qwen2.5-7B (commonly available); else fall back to
    // OpenAI's smallest. LLM_MODEL env wins over the sniff.
    const explicitModel = options?.defaultModel ?? process.env.LLM_MODEL
    if (explicitModel) {
      this.defaultModel = explicitModel
    } else if (this.baseURL.includes('deepseek')) {
      this.defaultModel = 'deepseek-chat'
    } else if (this.baseURL.includes('siliconflow')) {
      this.defaultModel = 'Qwen/Qwen2.5-7B-Instruct'
    } else if (this.baseURL.includes('dashscope') || this.baseURL.includes('aliyuncs')) {
      this.defaultModel = 'qwen-turbo'
    } else {
      this.defaultModel = 'gpt-4o-mini'
    }
  }

  /**
   * P11.17 · retry envelope.
   *
   * Every LLM call gets:
   *   - per-call timeout (default 60s, configurable LLM_TIMEOUT_MS)
   *   - exponential backoff retry on retryable failures (5xx, 408, 429,
   *     network errors). Default 2 retries → 1s, 3s.
   *   - fail-fast on non-retryable (400 bad request, 401 auth, parse errors)
   *
   * Why retry: DeepSeek (and proxies) intermittently return 502 / connection
   * resets. Before this envelope a single transient failure killed the whole
   * BMC round (9 cell agents → 1 fails → user sees 0 cell). With 2 retries the
   * effective error budget moves from "any one call" to "all 3 attempts fail".
   */
  async chat(options: LLMChatOptions): Promise<LLMResponse> {
    const body: Record<string, unknown> = {
      model: options.model ?? this.defaultModel,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
    }

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools
      body.tool_choice = 'auto'
    }

    // P11.18 · circuit-breaker check before any network attempt. If the
    // breaker is OPEN this throws immediately — caller falls through to
    // chatFallback / emitAgentDegraded paths instead of waiting on
    // 60s × 3 retries × 9 cells of timeouts.
    checkCircuitOpen(this.baseURL)

    const maxRetries = Number(process.env.LLM_MAX_RETRIES ?? '2')
    const timeoutMs = Number(process.env.LLM_TIMEOUT_MS ?? '60000')
    let lastError: unknown = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), timeoutMs)
      try {
        const res = await fetch(`${this.baseURL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: ac.signal,
        })
        clearTimeout(timer)

        if (!res.ok) {
          const text = await res.text()
          // Retryable HTTP statuses: 408 (timeout), 429 (rate limit), 5xx
          const retryable = res.status === 408 || res.status === 429 || res.status >= 500
          if (retryable && attempt < maxRetries) {
            const backoff = Math.min(15000, 1000 * Math.pow(3, attempt)) + Math.floor(Math.random() * 500)
            console.warn(`[llm-client] HTTP ${res.status} (retryable), attempt ${attempt + 1}/${maxRetries + 1}, retry in ${backoff}ms`)
            await new Promise((r) => setTimeout(r, backoff))
            continue
          }
          // Non-retryable HTTP error or retries exhausted → trip circuit.
          recordFailure(this.baseURL)
          throw new Error(`LLM API error ${res.status}: ${text.slice(0, 300)}`)
        }

        const data = (await res.json()) as {
          choices: Array<{
            message: { content: string | null; tool_calls?: LLMToolCall[] }
            finish_reason: string
          }>
          usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
        }

        const choice = data.choices[0]
        // P11.18 · success closes (or keeps closed) the circuit.
        recordSuccess(this.baseURL)
        return {
          content: choice.message.content,
          toolCalls: choice.message.tool_calls ?? [],
          finishReason: choice.finish_reason,
          usage: data.usage
            ? {
                promptTokens: data.usage.prompt_tokens,
                completionTokens: data.usage.completion_tokens,
                totalTokens: data.usage.total_tokens,
              }
            : undefined,
        }
      } catch (err) {
        clearTimeout(timer)
        const errStr = err instanceof Error ? err.message : String(err)
        // AbortError (timeout) and connection errors are retryable.
        const isAbort = err instanceof Error && (err.name === 'AbortError' || /aborted/i.test(errStr))
        const isNetwork = /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up/i.test(errStr)
        const retryable = isAbort || isNetwork
        if (retryable && attempt < maxRetries) {
          const backoff = Math.min(15000, 1000 * Math.pow(3, attempt)) + Math.floor(Math.random() * 500)
          console.warn(`[llm-client] ${isAbort ? 'timeout' : 'network'} error (retryable), attempt ${attempt + 1}/${maxRetries + 1}, retry in ${backoff}ms — ${errStr.slice(0, 120)}`)
          await new Promise((r) => setTimeout(r, backoff))
          lastError = err
          continue
        }
        // Non-retryable error or retries exhausted → trip circuit.
        recordFailure(this.baseURL)
        throw err
      }
    }
    // P11.18 · all retries exhausted → record failure (may trip circuit).
    recordFailure(this.baseURL)
    // Unreachable in practice (loop always either returns or throws), but
    // satisfies TS exhaustiveness.
    throw lastError ?? new Error('LLM client retries exhausted')
  }

  buildToolSchema(
    name: string,
    description: string,
    parameters: Record<string, unknown>,
  ): LLMToolSchema {
    return {
      type: 'function',
      function: { name, description, parameters },
    }
  }

  /**
   * P11.18 · True token-level streaming via SSE.
   *
   * Yields each delta as the upstream LLM produces it. Compatible with
   * any OpenAI-style `chat/completions` endpoint that supports
   * `stream: true` (DeepSeek, OpenAI, SiliconFlow, DashScope all do).
   *
   * Usage:
   *   for await (const chunk of llm.streamChat({ messages: [...] })) {
   *     if (chunk.kind === 'token') process.stdout.write(chunk.delta)
   *     if (chunk.kind === 'done') console.log('total:', chunk.fullText)
   *   }
   *
   * Caveats:
   *   - No retry loop here — streaming retries are non-trivial (need
   *     to replay partial state); fail-fast on first error.
   *   - Tool calls are not yielded as deltas (they only land in the
   *     final `done` event). For tool-calling, use chat() (synchronous).
   *   - Circuit breaker still applies; failure trips it as expected.
   */
  async *streamChat(options: LLMChatOptions): AsyncGenerator<
    | { kind: 'token'; delta: string }
    | { kind: 'done'; fullText: string; finishReason: string; usage?: LLMResponse['usage'] }
    | { kind: 'error'; error: string }
  > {
    const body: Record<string, unknown> = {
      model: options.model ?? this.defaultModel,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      stream: true
    }

    checkCircuitOpen(this.baseURL)
    const timeoutMs = Number(process.env.LLM_STREAM_TIMEOUT_MS ?? '180000')
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeoutMs)
    let fullText = ''
    let finishReason = 'stop'
    let usage: LLMResponse['usage'] | undefined

    try {
      const res = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          Accept: 'text/event-stream'
        },
        body: JSON.stringify(body),
        signal: ac.signal
      })

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '')
        recordFailure(this.baseURL)
        yield { kind: 'error', error: `LLM stream error ${res.status}: ${text.slice(0, 200)}` }
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // SSE frames are separated by double newlines; each frame is
        // one or more `data: ...` lines.
        let nlIdx: number
        while ((nlIdx = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, nlIdx)
          buffer = buffer.slice(nlIdx + 2)
          for (const line of frame.split('\n')) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data:')) continue
            const payload = trimmed.slice(5).trim()
            if (payload === '[DONE]') continue
            try {
              const json = JSON.parse(payload) as {
                choices?: Array<{
                  delta?: { content?: string | null }
                  finish_reason?: string | null
                }>
                usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
              }
              const choice = json.choices?.[0]
              const delta = choice?.delta?.content
              if (typeof delta === 'string' && delta.length > 0) {
                fullText += delta
                yield { kind: 'token', delta }
              }
              if (choice?.finish_reason) finishReason = choice.finish_reason
              if (json.usage) {
                usage = {
                  promptTokens: json.usage.prompt_tokens ?? 0,
                  completionTokens: json.usage.completion_tokens ?? 0,
                  totalTokens: json.usage.total_tokens ?? 0
                }
              }
            } catch {
              // Tolerate malformed frames — don't break the stream.
            }
          }
        }
      }
      recordSuccess(this.baseURL)
      yield { kind: 'done', fullText, finishReason, usage }
    } catch (err) {
      recordFailure(this.baseURL)
      yield {
        kind: 'error',
        error: err instanceof Error ? err.message : String(err)
      }
    } finally {
      clearTimeout(timer)
    }
  }
}
