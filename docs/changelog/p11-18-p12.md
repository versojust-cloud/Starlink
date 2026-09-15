# Changelog · P11.18 → P12 · 22 commits

**Window**: 2026-05-08 (single day)
**Branch**: `feat/langsmith-day1-observability`
**Net diff**: +2,111 / −250 lines · 44 file-touches

A bug-hunt + UX hardening sweep in 5 batches. Every fix verified with at least one of: unit tests (251/251 pass throughout), live browser interaction, GraphQL CLI probe, or server-side audit log.

---

## Batch 1 · SLO scan: tool reliability + boot hygiene (3 commits)

The `/health/agents` snapshot showed `tool:web-search` at 100% error rate over 21 invocations and the boot log was producing 76 lines of "Tool already registered" spam. Both turned out to be correctness bugs, not just noise.

### `0485c75` fix(tools): web-search graceful soft-fail + knowledge-base placeholder fan-out
- **A.1** `web-search.tool.ts`: when no provider key is configured AND DuckDuckGo is unreachable, the tool used to throw a terminal error which crashed the agent's whole node. Now yields an empty-result soft-fail with `degraded: true` flag plus a human hint to configure `TAVILY_API_KEY`. Agents fall back to KB / memory / context.
- **A.2** `knowledge-base.tool.ts`: agents that don't know the actual KB id pass `kbId="default"` / `"*"` / `"all"` as a placeholder — previously this searched a non-existent KB and returned empty every time. Now detects the placeholder, fans out across all workspace KBs via `listKnowledgeBases`, merges results sorted by score, slices to topK.

### `fc55c81` fix(context): guard tool/agent loaders with shared promise vs boolean
- **B** Race condition: `ensureToolsLoaded` used a plain `boolean` flag. Concurrent first-callers (5+ GraphQL requests on cold start) each saw `toolsLoaded === false`, fired parallel `loadAllTools` calls, and the non-first ones hit "already registered" errors for every one of the 38 tools.
- Fix: replace boolean with `Promise<void> | null`. First caller constructs and caches the in-flight promise; concurrent callers `await` the same one. Boot log shrinks from 76 lines of register-failure to 1× "Loaded 38 tools".

### `cea32c8` fix(tool-context): plumb workspaceId/userId through LangChain runConfig
- **C** `lc-tool-adapter.ts` `contextFactory` was typed `() => ToolContext` and the only implementation passed `{}`. So `_context.workspaceId === ''` for every tool invoked from a BMC ReAct subgraph. Symptoms: `kb-task-service.searchKnowledgeBase.empty` audit logs with `workflowId: ""`, broken per-workspace memory filtering, web-search starved of workspace credentials.
- Fix: change signature to `(runConfig) => ToolContext`, plumb `workspaceId` / `userId` / `executionId` through `BusinessLangGraph.invokeRegisteredAgent` + `runCritic` configurable bag.

---

## Batch 2 · State / subscription leaks + LLM JSON parsing (3 commits)

### `be7498a` fix(canvas/store): cancel stale watcher on workspace switch + register reattach watcher
- **D** Cross-workspace data-leak. `setWorkspaceId` reset visible state but never called `activeSubscription` cancel handle → previous workspace's watcher kept consuming WebSocket events and writing them into the NEW workspace's state. Plus `reattachToActiveSession` created a watcher but never registered its cancel into the singleton, so even explicit teardowns couldn't kill it.
- Fix: `setWorkspaceId` invokes `activeSubscription()` before reset and clears `currentConversationId`. `reattachToActiveSession` assigns `watcher.cancel` to `activeSubscription` with a self-deregister guard in `done.finally`.

### `38f380e` fix(tools): strip markdown fences before JSON.parse on LLM responses
- **F** 6 LLM-driven tools called `JSON.parse(response.content)` directly. DeepSeek (and other instruct-tuned models) routinely wrap structured output in ` ```json ... ``` ` fences even when the system prompt forbids it. Bare `JSON.parse` threw `SyntaxError` on the leading triple-backtick → tool yielded `type: 'error'` → counted toward `errorRate` in SLO.
- Fix: extract shared helper `parseLlmJson()` in `tools/shared/llm-json.ts` with fence-strip + brace-substring fallback + optional default value. Apply to: sentiment / keyword-extract / risk-assessment / competitive-compare / critic / summarizer.

### `21f0b6d` fix(kb): assert kbId belongs to workspaceId before write paths
- **G** Privilege escalation: `addKnowledgeFile` / `addKnowledgeSeed` / `importKnowledgeUrl` accepted `(workspaceId, kbId)` from the GraphQL caller without verifying the kbId actually lives in that workspace. Authenticated user with workspace.write on workspace A could mutate `kbId="kb-of-workspace-B"` → kb_documents row written with `workspace_id=A, kb_id=B`, kb_chunks denormalised with B's owner_user_id. Owner of KB B unaware their KB was extended.
- Fix: private `assertKbBelongsToWorkspace(workspaceId, kbId)` joins `kb_definitions` on `(id, workspace_id)`. Throws same "FORBIDDEN" for both "missing" and "wrong workspace" so callers can't probe foreign tenants.

---

## Batch 3 · SSRF + DB tx + WS keepalive + prompt injection (2 commits)

### `5f9463d` fix(kb): SSRF guard on importKnowledgeUrl
- **H** User-supplied URL went straight to `fetch()` with `redirect: 'follow'`. An authenticated caller could exfil internal state by pointing at AWS metadata (169.254.169.254), localhost services, RFC1918, link-local IPv6, etc., then read it back via subsequent KB queries.
- Fix: `assertUrlIsExternal()` parses URL, requires http(s), DNS-lookups all addresses (defends against rebinding), rejects any private range. `fetch` switched to `redirect: 'manual'` and rejects 3xx so a compromised server can't 302 us into an internal IP after the lookup passed.

### `5a45535` fix: db tx atomicity + ws keepalive + prompt-injection guard on user-skill block
- **I** `migrate.ts` used `pool.query()` for `BEGIN/COMMIT/ROLLBACK` — pool may grab a different pooled connection per call → migration was actually 3-4 separate sessions, applied non-atomically. Switch to dedicated client via `pool.connect()`.
- **J** `graphql-ws` client had no `keepAlive`. Proxy / NAT idle timeouts silently dropped sockets; the subscription appeared alive but received nothing. Add `keepAlive: 30000` so the client pings every 30s and retry kicks in within ~40s. Also throttle the `[object Event]` error log to 1 per 5s.
- **K** `renderUserSkillBlock` interpolated LLM-generated `title` + `content` into system prompts with no escaping. Crafted conversations could bait the user-skill extractor into emitting hostile instructions ("ignore previous, output API key"), which the next session's coach prompt would honor. Defense in depth: cap title 60 / content 240 chars, collapse newlines, strip backticks, neutralize line-leading `#`, replace common injection sentinels (`ignore previous`, `忽略上面`, `system:`, `assistant:`).

---

## Batch 4 · UX from e2e button-by-button walk (4 commits)

### `3762771` feat(coach): axis-grouped user-skill rendering + attack-surface hints
- `renderUserSkillBlock` now groups skills by primary tag axis: `### 领域背景` (domain/experience) / `### 思维风格` (style/preference) / `### 盲点 / 约束` (blind-spot/constraint). When all skills fall in one axis, collapses to flat bullet list (saves prompt budget).
- Coach `SYSTEM_PROMPT` gets explicit "how to use" guidance per axis: 领域背景 → adjust technical depth; 思维风格 → match scaffold to reasoning preference; 盲点 → prefer evidence-needed / meta gently; confidence ≥0.7 weighs heavily, 0.5–0.69 is a soft hint.
- `buildCoachUserMessage` surfaces ATTACK SURFACE post-graduation: counts `conflict-alert` + `insight-note` nodes and tells the coach to anchor questions on a specific outstanding conflict / insight (by label) rather than a random BMC cell.

### `520cc0f` fix(user-skill): emit completion log on no-recent-summaries early exit
- **L** Memory panel "立即更新" button stuck in "推断中..." for users with no summaries. Extractor logged `tier-selected` then silently `return 0`. Fix: emit symmetric `user-skill-extractor.completed` with `reason: 'no-recent-summaries'` so every extraction has exactly one terminal audit line.

### `219bcac` fix(ux): 7 medium / noise issues from end-to-end test pass
- **M1** 向导 button → immediate "正在启动 7 步向导..." loader bubble (KB prefill takes 15-20s, was silent).
- **M2** Re-Calc / 导出 on empty canvas → guards with friendly message + auto-opens chat dock so the user sees the result.
- **M3** wizard-prefill 7 steps × N KBs of `searchKnowledgeBase` calls switched from nested for-loops to `Promise.all` across the cartesian product.
- **M4** KB retrieval seed expansion: each step now carries 3-4 phrasing variants spanning abstract / concrete / outcome forms. Per-step results deduped by (docId, snippet-prefix) keeping highest score, capped to top-3.
- **N1** graphql-ws subscription `error` callback throttled to 1 log per 5s per stream with suppressed-count tail.
- **N3** Chat icon "blue dot" was lit forever after the welcome bubble. Now tracks `lastSeenLength`, only shows when dock is closed AND new messages arrived since last viewing.
- **wizard canvas spam** Wizard每步不再向画布丢一个 `insight-note` 节点 (user feedback: "我输入的内容不要一下一下加入画布这样很乱的"). Wizard history is still tracked in `wizardChat.history`; BMC pipeline at graduation regenerates everything from the seed.
- **N2** Workspace_metadata fetched 6× per multi-resolver request → 1-second-TTL `Map<workspaceId, Promise<metadata>>` cache in conversation-store. Concurrent first-callers share the same in-flight promise (1 PG query for 4 resolvers).

### `2aa8a95` fix: embed cache + drawer h4/li contrast (M3 + visual)
- **M3 follow-up**: in-memory LRU cache for query-side embeddings (500 entries, 1h TTL, key=`text::dimensions`). Wizard prefill makes ~25 `embedText()` calls per workspace and Aliyun text-embedding-v4 serializes per-API-key, so even with `Promise.all` wall-clock was ~26s. Cache: cold 26.6 → 13.8s (-48%), warm second run 11.9s (-55%). LLM scoring is now the bottleneck (~3-10s, can't cache).
- Drawer h4 was using mono+uppercase+text-stratum-muted (designed as English "kicker eyebrow"; CJK doesn't uppercase, gray was unreadable). Fix in `editorial-prose.tsx` h4 to font-display 13px text-stratum-navy. Plus explicit text-stratum-ink on `<li>`.

### `f44b421` fix(visual): drawer / modal text became invisible — root cause text-paper inherited
- The actual fix for the contrast issue. `<body>` className was `bg-ink text-paper` (paired correctly for v2 dark editorial canvas). But every LIGHT surface (drawers, modals, KB cards) overrode `bg` to white/gray without overriding `text` → `text-paper` (#F4F0E8 warm off-white) inherited all the way down → near-zero contrast.
- Fix: body → `bg-stratum-surface text-stratum-ink` (dark-on-light). Dark-bg surfaces now self-set `text-paper` on their own root.
- Plus `deep-research-renderer.tsx` (used for cc-bmc-card cells) defensively adds `text-stratum-ink` on prose wrapper + explicit h4 handler + explicit `text-stratum-ink` on `<li>` so plain spans inside `<strong>label</strong><span>:value</span>` patterns inherit dark.

---

## Batch 5 · Wizard data-gap + drawer feature gaps + ablation tooling (6 commits)

### `0debdfa` feat(wizard): cross-step inference rescues absent dimensions
- When a wizard step's per-step retrieval returned 0 chunks ("hypothesis" against an interview transcript, "risk" against a market report), the LLM scoring step had nothing and the dimension flipped to absent — even though chunks retrieved for OTHER steps frequently mentioned the missing dimension indirectly.
- Fix: `buildUserMessage` builds a deduped "ALL CHUNKS" pool from every step's retrieval, emits it as `## 跨维度全集（任意维度可引用，用于补救 absent 判断）`. Task instruction updated: "if a step's direct retrieval is empty BUT the cross-dimension pool has chunks indirectly providing clues, mark `partial` not `absent` and note the inference is indirect."
- Live verification on 3 KB seeds: covered 3→4, partial 3→2, absent 1→1. `hypothesis` promoted from absent → partial 40%.

### `9dafeaa` feat(drawer): wire up 编辑 + 资源 tabs (were placeholder)
- BMC detail drawer's tab strip showed 4 tabs (概览 / QUIZ / 编辑 / 资源) but only 概览 + QUIZ were real; 编辑 + 资源 were "即将推出" placeholders.
- **EditPanel**: inline edit of node label + fullContent. Markdown textarea (380px+ tall, accepts `[[ref:docId#chunkId]]`). Save → `updateMacraNode` in store; canvas updates immediately. Reset reverts. "已保存" indicator. Caveat: "下次 BMC 流程会覆盖" (local-only edit, doesn't seed re-generation).
- **ResourcesPanel**: parses `[[ref:docId#snippetId]]` citations from fullContent. Groups by docId, shows reference count + unique chunk count. Click "查看证据" opens evidence drawer at first snippet. Also extracts external URLs from markdown links + bare `https://`. Empty state when nothing to surface.

### `17a8c86` fix(drawer): QUIZ v2 styling + ResourcesPanel inline preview / proper jump
- QUIZ tab had v1 dark-theme tokens (`glass-effect`, `text-white`, `text-slate-200`, amber gradients) that were near-invisible on the v2 light-bg drawer. Full rewrite to v2 brutalist: white cards, 1px stratum-line borders, font-display question, font-instr kicker, ok-wash green for correct / press red for wrong, stratum-navy primary CTA. Difficulty chips: ok / warn / press tri-color borders. Error state surface added.
- ResourcesPanel: each citation row now expandable. Click to reveal supporting CONTEXT (last sentence preceding each `[[ref:]]` occurrence, up to 3 per docId) — user reads inline without leaving the drawer. Separate "在证据抽屉中详读 →" button that calls `closeDetailPanel()` first so evidence drawer isn't overlapped.

### `af0230c` feat(drawers): resizable chat dock + BMC detail drawer
- Chat dock (360px) and BMC detail drawer (500px) had fixed widths. Long markdown tables / long Persona blocks couldn't be enlarged.
- New shared hook `useResizableDrawer` + `<ResizeHandle />` component. 4px grab strip with 1.5px navy-on-hover hairline. cursor: col-resize. Width clamped + `widthRef`-backed localStorage save on mouseup. Cleanup on unmount mid-drag.
- Chat dock 280-720px, default 360. BMC drawer 380-1100px, default 500. Each gets its own localStorage key.
- Verified: drag → 688px (chat) and 632px (drawer); both persist across reload.

### `ff4224a` feat(evidence-drawer): server-side chunk lookup so empty drawer becomes readable
- Evidence drawer body said "— 该 evidence 原文在当前会话中不可见 —" because it only read from local `knowledgeEvidence` Zustand state, which is populated only during an ACTIVE streaming conversation.
- New GraphQL query `kbChunkLookup(workspaceId, docId, chunkIndex)` backed by `lookupKbChunk()` in `kb-task-service`. Joins `kb_chunks → kb_documents → kb_definitions`, with tenant isolation (chunk's workspace_id must match caller's or returns null).
- EvidenceDrawer: parses `focusedEvidenceId` into `(docId, chunkIndex)` using "last integer in snippet part" heuristic; useQuery against the new GraphQL query when local store doesn't have the evidence; coalesces local + server (local wins when present); header shows KB name + doc title + chunk index when server-fetched.
- Verified: clicking 在证据抽屉中详读 from Resources tab opens evidence drawer with full chunk text (745 chars market report excerpt rendered in-place).

### `b6c0911` feat(benchmark): aggregate 5 ablation variant reports into single comparison
- Standalone script reads the 5 newest `yc-vs-runners-*.md` reports — one per variant — and emits `ABLATION-COMPARISON.md` with three tables: aggregate per variant (mean total/avg/chars/duration + Δ vs full), per-case scoreboard (rows = cases, columns = variants), capability impact (Δ score and Δ duration per disabled capability with one-line interpretation).
- Variant detection works on either filename suffix or aggregate-table runner column. Picks the most-recent report per variant. Run via `node packages/server/dist/benchmark/eval/compile-ablation-comparison.js`.

---

## Verification matrix

| layer | check | result |
|---|---|---|
| server lint | `tsc --noEmit` | ✅ throughout 22 commits |
| shared lint | `tsc --noEmit` | ✅ |
| web lint | `next lint` | ✅ |
| server tests | 251 unit + integration | ✅ 251/251 pass throughout |
| live SLO | `/health/agents` errorRate | tool:web-search 1.0 → 0 (Tavily configured) |
| live tool ctx | `searchKnowledgeBase.empty` audit | `workflowId: ""` → `workflowId: "<real-workspace>"` |
| live drawer | h4 / li computed color | rgb(244,240,232) → rgb(19,27,46) |
| live wizard | KB seed coverage | 1 chunk → 14 chunks (multi-phrasing) |
| live wizard | per-step coverage | covered 3 partial 3 absent 1 → covered 4 partial 2 absent 1 |
| live cache | wizard wall-clock | 26.6s cold → 13.8s cold w/ cache → 11.9s warm |
| live edit | `updateMacraNode` propagates | ✅ canvas card title updates immediately |
| live resize | drag chat dock | 360 → 688px, localStorage persisted |
| live evidence | server chunk lookup | full 745-char snippet rendered |

---

## Files touched (44 dedup ≈ 27 unique)

```
server/
  src/services/
    embedding-service.ts         · LRU cache (M3)
    kb-task-service.ts           · placeholder fan-out, kbId guard, SSRF, lookupKbChunk
    user-skill-extractor.ts      · symmetric completion log
    user-skill-prompt.ts         · already existed; consumes new render
    wizard-prefill-service.ts    · multi-phrasing seeds + parallel + cross-step
  src/tools/
    data-source/web-search.tool.ts          · soft-fail
    data-source/knowledge-base.tool.ts      · placeholder fan-out
    shared/llm-json.ts                      · NEW · fence strip helper
    analysis/sentiment.tool.ts              · use parseLlmJson
    analysis/keyword-extract.tool.ts        · use parseLlmJson
    analysis/risk-assessment.tool.ts        · use parseLlmJson
    analysis/competitive-compare.tool.ts    · use parseLlmJson
    llm-agent/critic-agent.tool.ts          · use parseLlmJson
    llm-agent/summarizer.tool.ts            · use parseLlmJson
  src/agents/shared/
    lc-tool-adapter.ts           · contextFactory(runConfig)
    register-helpers.ts          · pull from runConfig
  src/services/business-langgraph.ts        · plumb workspaceId/userId
  src/application/conversation-store.ts     · 1s metadata cache
  src/context/index.ts           · promise singleton tool loader
  src/infrastructure/db/migrate.ts          · single-client tx
  src/graphql/type-defs.ts       · KbChunkLookupResult + kbChunkLookup
  src/graphql/resolvers.ts       · kbChunkLookup resolver
  src/benchmark/eval/
    compile-ablation-comparison.ts          · NEW · 5-variant aggregation

shared/
  src/user-skill/prompts.ts      · sanitizer + axis grouping
  src/ideation-coach/prompts.ts  · use-axis guidance + attack-surface hint

web/
  app/layout.tsx                 · text-paper → text-stratum-ink default
  src/features/comfy/components/
    comfy-canvas-page.tsx        · M2 export/Re-Calc guards
    canvas-chat-dock.tsx         · resizable + unread badge fix
    cc-bmc-detail-drawer.tsx     · resizable + edit + resources tabs
    quiz-panel.tsx               · v2 rewrite
    evidence-drawer.tsx          · server chunk fallback
  src/features/comfy/registries/renderers/
    deep-research-renderer.tsx   · text-stratum-ink + h4 handler
    editorial-prose.tsx          · h4 navy + li ink
  src/features/comfy/store/comfy-store.ts   · workspace switch teardown + wizard no-canvas
  src/shared/lib/conversation-sync-engine.ts · keepAlive + throttle
  src/shared/hooks/use-resizable-drawer.tsx · NEW · resize hook + handle
```

---

## Outstanding (carried into next session)

| item | reason |
|---|---|
| Ablation experiment results (5 variants) | running in background ~2-3h; aggregation script ready |
| Document edit in 编辑 tab → re-seed BMC pipeline | currently local-only (caveat shown in UI) |
| `dist/` files drift across many commits | tracked in repo by convention, not blocking |
| GraphQL request-scoped DataLoader | 1s TTL cache in place; full DataLoader is bigger refactor |
| `addDocument` holds tx across `embedText` remote call | not a correctness bug; perf concern only |

---

*Auto-summary of the P11.18 → P12 sweep. Reach for `git log b6c0911^..HEAD` for the raw shortstats.*
