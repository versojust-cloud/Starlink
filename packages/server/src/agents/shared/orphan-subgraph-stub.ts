/**
 * Stub "subgraph" for orphan agents (LangGraph hygiene fix #3, 2026-04-28).
 *
 * Six agents — synthesizer, general-responder, moderator, market-opponent,
 * product-opponent, finance-opponent — register themselves via
 * `registerAgent` / `registerAdvisor` so their `agent.yaml` profiles are
 * discoverable, but the top-level business-langgraph never actually calls
 * `invokeRegisteredAgent(<their-id>, ...)`. The `LlmDebateInvoker` reaches
 * for their `agent.yaml` system_prompt directly, bypassing LangGraph.
 *
 * Pre-fix: each of these files built a 1-node StateGraph and called
 * `.compile()` at module load. Six unnecessary StateGraph compiles per
 * gateway boot.
 *
 * Post-fix: they register the shared `getOrphanSubgraphStub()` value,
 * which exposes a duck-typed `invoke()` that throws a clear error if
 * anyone DOES try to invoke (catches future regressions where someone
 * wires invokeRegisteredAgent('moderator', ...) without realising the
 * subgraph is a stub). No LangGraph compile, no Pregel state machine,
 * just a few bytes of memory.
 */

interface OrphanSubgraphStub {
  /** Throws — orphan agents must not be invoked through the registry.
   *  See file header for context. */
  invoke: (input: unknown, config?: unknown) => Promise<unknown>
}

let cached: OrphanSubgraphStub | null = null

export function getOrphanSubgraphStub(): OrphanSubgraphStub {
  if (cached) return cached
  cached = {
    invoke: async () => {
      throw new Error(
        'orphan-subgraph-stub: invoked. ' +
          'This agent is registered for capability discovery + agent.yaml prompt ' +
          'access only; LangGraph subgraph invocation is not wired. If you need ' +
          'to invoke this agent through invokeRegisteredAgent(), replace the ' +
          'stub with a real compiled StateGraph in its agents/<id>/graph.ts file.'
      )
    }
  }
  return cached
}
