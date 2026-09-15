/**
 * Shared helper for parsing LLM-emitted JSON inside tools.
 *
 * P11.18 fix F: every analysis / llm-agent tool used to call
 * `JSON.parse(response.content)` directly. DeepSeek (and most
 * other instruct-tuned models) routinely wrap structured output
 * in markdown code fences:
 *
 *     ```json
 *     {"score": 0.42}
 *     ```
 *
 * even when the system prompt says "respond ONLY with a JSON
 * object". Bare JSON.parse throws SyntaxError on the leading
 * "```", and the tool's outer try/catch yields a `type: 'error'`
 * — which the lc-tool-adapter then surfaces as a tool failure
 * to the agent. From an SLO standpoint these look like genuine
 * tool errors and contribute to errorRate. Symptom in
 * /health/agents: tool:sentiment_analysis / tool:summarizer /
 * etc. with non-zero error rate that disappears the moment you
 * change the prompt to forbid fences (which doesn't always work).
 *
 * This helper centralises the strip+parse so the fix lives once.
 *
 * Strategy mirrors `extractJsonObject` in tools/llm-agent/bmc-output.ts:
 *   1. Fenced extraction: ```json...``` or ```...```
 *   2. Substring between first '{' and last '}' (or first '[' / last ']')
 *   3. Parse, returning the raw value (caller schemas validate)
 *
 * Throws when no JSON-looking substring exists or JSON.parse fails;
 * callers should wrap in their own try/catch the way they already do
 * for `JSON.parse`.
 */

export function parseLlmJson<T = unknown>(
  content: string | null | undefined,
  fallback?: T
): T {
  const trimmed = (content ?? '').trim()
  if (!trimmed) {
    if (fallback !== undefined) return fallback
    throw new Error('LLM returned empty content')
  }

  // 1. Fenced code block — case-insensitive, optional 'json' tag.
  //    Match groups: 1 = body inside the fence (tag stripped).
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  let candidate: string | null = null
  if (fenced?.[1]) {
    candidate = fenced[1].trim()
  } else {
    // 2. Substring between first { / [ and last matching } / ].
    //    Picks whichever bracket pair is widest (covers both array
    //    and object outputs).
    const objStart = trimmed.indexOf('{')
    const objEnd = trimmed.lastIndexOf('}')
    const arrStart = trimmed.indexOf('[')
    const arrEnd = trimmed.lastIndexOf(']')
    const objSpan = objStart >= 0 && objEnd > objStart ? objEnd - objStart : -1
    const arrSpan = arrStart >= 0 && arrEnd > arrStart ? arrEnd - arrStart : -1
    if (objSpan < 0 && arrSpan < 0) {
      if (fallback !== undefined) return fallback
      throw new Error('LLM output does not contain a JSON object or array')
    }
    if (arrSpan > objSpan) {
      candidate = trimmed.slice(arrStart, arrEnd + 1)
    } else {
      candidate = trimmed.slice(objStart, objEnd + 1)
    }
  }

  try {
    return JSON.parse(candidate) as T
  } catch (err) {
    if (fallback !== undefined) return fallback
    throw new Error(
      `JSON.parse failed on LLM output (len=${candidate.length}): ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
}
