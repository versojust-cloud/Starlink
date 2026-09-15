# Architectural Decision Record · Wave F — GraphQL gateway lift for Ideation Coach

**Status**: scaffold landed; full implementation in progress
**Date**: 2026-04-27
**Decider**: human + Claude pairing session

## Context

The Ideation Coach (Stage B) currently calls DeepSeek through Next.js API routes:
- `POST /api/ideation/reflect` — reactive coach reflection
- `POST /api/ideation/wizard-step` — wizard step processing

These work, but **bypass the Apollo GraphQL gateway** that BMC mode uses. Two issues:

1. **No shared auth / rate-limit / OTel** — the gateway has middleware (`packages/server/src/middleware/`) that the Next.js routes can't access
2. **Prompt + schema duplication** — both routes embed the same `SYSTEM_PROMPT` constant + Zod schemas. If a future change tweaks the prompt for one, the other drifts

## Constraints

- `apps/web/` (Next.js) and `packages/server/` (Apollo) are **separate runtimes** — they can't import code from each other directly
- Both can import from `packages/shared/` (already published as `@starlink/shared`)
- Both runtimes have `fetch` available — so the actual DeepSeek HTTP call can live in either, but the prompt + schema + JSON-parsing logic should be DRY

## Decision

Three-tier split:

```
                 ┌──────────────────┐
                 │ packages/shared/ │
                 │  ideation-coach/ │
                 │  ────────────────│
                 │  · prompts.ts    │  ← system + user-message builders
                 │  · schemas.ts    │  ← Zod request/response
                 │  · parser.ts     │  ← LLM JSON → typed shape
                 └────────┬─────────┘
                          │ imports
              ┌───────────┴───────────┐
              ▼                       ▼
   apps/web Next.js             packages/server Apollo
   /api/ideation/reflect        Mutation: reflectOnIdeation
        ↓                            ↓
   fetch deepseek                fetch deepseek (or existing
                                  llm-factory with structured
                                  output via withStructuredOutput)
```

The prompt + schema + parsing live in `packages/shared/src/ideation-coach/`. The HTTP call stays per-runtime (each runtime decides whether to use plain fetch, the LangChain adapter, or any other client).

## Migration order

1. **F.2** ✅ Move `SYSTEM_PROMPT` + `buildUserMessage` from `apps/web/app/api/ideation/reflect/route.ts` → `packages/shared/src/ideation-coach/prompts.ts`
2. **F.3** ✅ Move Zod schemas from `apps/web/src/features/ideation/types/coach-rpc-types.ts` → `packages/shared/src/ideation-coach/schemas.ts` (apps/web file becomes a re-export)
3. **F.4** ⏸ Refactor `apps/web/app/api/ideation/reflect/route.ts` to import from `@starlink/shared`
4. **F.5** ⏸ Add `reflectOnIdeation` GraphQL mutation in `packages/server` consuming the same shared module
5. **F.6** ⏸ (Optional) Migrate frontend orchestrator from `/api/...` to GraphQL — only when there's a clear UX or auth benefit

Same plan applies to `wizard-step` (F.7-F.9, parallel structure).

## Why not skip the shared package and duplicate?

We considered it — the prompts are ~150 lines and copy-pasting works. But:
- We already have a track record of editing the prompts (Stage B → B+) and they're going to keep evolving as we add LLM features
- Each prompt edit becomes a 2-file edit if we duplicate, with merge-conflict risk
- Zod schemas drifting between client + server is a real bug source

Single shared module wins on maintainability, even if the up-front cost is one extra package.

## Why not unify the HTTP call too?

Two reasons:
- Apollo gateway might want `withStructuredOutput` (LangChain-flavoured) for consistency with BMC; Next.js route prefers raw `fetch` for bundle size. Forcing both to use the same client adds complexity.
- The fetch call itself is ~15 lines. Sharing it would save little, and tightly couple shared package to a specific HTTP shape.

## Status as of this commit

- F.1 (this ADR) ✅
- F.2 (move prompts) — landing in this session
- F.3 (move schemas) — landing in this session
- F.4 (Next.js refactor) — landing in this session, proves the shared module compiles + runs in both runtimes
- F.5 (GraphQL mutation) — **deferred** to next session; needs Apollo type-defs / resolver wiring + auth/rate-limit middleware integration

## Cross-references

- Coach REST endpoints: `apps/web/app/api/ideation/{reflect,wizard-step}/route.ts`
- BMC GraphQL gateway pattern (reference for F.5): `packages/server/src/graphql/`
- Existing shared package: `packages/shared/src/`
