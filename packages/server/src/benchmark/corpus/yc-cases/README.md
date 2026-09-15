# Tier A Benchmark — YC + extended cases

Real-startup benchmark dataset for Starlink's BMC pipeline. Replaces the
synthetic / authored-probe cases under `corpus/cases/` with public,
verifiable startup info + hand-authored ground-truth BMCs.

## Status

- **Tier A**: 12 hand-curated seed cases ✅
- **Tier A target**: 30-50 cases stratified by sector + outcome
- **Tier B**: Recruit 3-5 MBA annotators via Prolific → ~50 cases × 3 annotators × 45 min × $20/hr ≈ $2,250. Compute Krippendorff's α inter-annotator agreement.
- **Tier C**: Domain-expert annotated (Wharton/INSEAD/IESE entrepreneurship faculty), IRB-blessed, ~200 cases. Released as CC-BMC-Bench v1.0 on HuggingFace.

## Current cases (12)

| case_id | sector | outcome | notes |
|---|---|---|---|
| `yc-stripe-2024` | fintech | active | Reference "ceiling" — heavily documented |
| `yc-airbnb-2024` | marketplace | public | Two-sided marketplace pattern |
| `yc-replit-2024` | devtools | active | Multi-segment freemium + AI-cost-heavy |
| `yc-pebble-2016` | hardware | shut-down | Negative example — tests outcome-conditioned BMCs |
| `extended-coursera-2024` | edtech | public | NOT YC (extended sector representative) |
| `yc-notion-2024` | consumer-saas | active | Bottom-up cross-segment SaaS, blocks model |
| `yc-coinbase-2021` | fintech | public | Regulated marketplace, compliance-heavy cost |
| `yc-doordash-2020` | logistics | public | Three-sided gig marketplace, courier-pay dominates cost |
| `yc-twitch-2014` | gaming | acquired | Two-sided creator platform; first acquired-outcome case |
| `yc-segment-2020` | b2b-saas | acquired | First b2b-saas case; CDP / developer-led GTM |
| `yc-brex-2024` | fintech | active | Non-API fintech; credit losses dominate cost |
| `yc-substack-2024` | media | active | First media case; revenue-share + creator partnerships |

**Sector coverage at N=12** (sectors / 12): fintech ×3, marketplace, devtools, hardware, edtech, consumer-saas, logistics, gaming, b2b-saas, media — 10 of 15 enum values represented.

**Outcome coverage at N=12**: active ×5, public ×4, acquired ×2, shut-down ×1 — all 4 enum values represented.

## Schema

`yc-company-schema.ts` — Zod schema. Each case has:

- **Provenance**: `case_id`, `company_name`, `yc_batch`, `source_url` (back to public listing), `fetched_at`
- **Public profile**: `one_liner`, `description` (verbatim from source), `website`
- **Hand-curated meta**: `sector`, `outcome`, `stage_at_outcome`, `outcome_year`
- **Ground-truth BMC**: 9-dimension object with `ground_truth` + `must_cover` + `must_not_cover` per cell
- **Annotator meta**: `annotator_id`, `annotation_quality` (`draft` | `reviewed` | `expert-validated`), free-text `notes`

## How to add a case (manual, Tier A)

**Use `_TEMPLATE.ts`**:

1. Copy `_TEMPLATE.ts` to `yc-<company-slug>.ts` (e.g. `yc-doordash-2024.ts`)
2. Replace every `__FILL__` placeholder with real content
3. Pick `case_id`, `company_name`, `yc_batch`, `source_url`
4. Copy `one_liner` + `description` verbatim from the YC profile page
5. Author the `ground_truth_bmc` 9-cell object — 1-2 sentences per cell + 2-5 `must_cover` concept tokens + (optional) 1-3 `must_not_cover`
6. Set `annotator_id` and `annotation_quality: 'draft'`
7. Add the new export to `index.ts` SEED_CASES array
8. Run `pnpm --filter @starlink/server lint` to confirm Zod passes
9. (Optional) Smoke-test: `node packages/server/dist/benchmark/eval/yc-judge-smoke.js --case=yc-<company-slug>-2024`

The template's bottom comment includes a **stratification target** for the next 25 cases — pick a company that fills an underrepresented sector + outcome cell.

## How to add a case (semi-automated, Tier B+ — TODO)

Stage J.4-J.5 work:

1. Build a YC directory scraper (`scripts/scrape-yc-directory.ts`) — fetches one-liner + description + batch + status from public listing
2. Recruit Prolific annotators → distribute `ground_truth_bmc` template + `must_cover` guidelines
3. 3 annotators per case → measure Krippendorff's α
4. Cases with α ≥ 0.6 promoted to `annotation_quality: 'reviewed'`

## Evaluator

The companion `eval/agent-as-judge.ts` consumes these cases. See its file
header for the rubric + LLM judge prompt template.

Current state: heuristic stub (token overlap). Real LLM judge call lands
in Stage J.4.

## Licensing notes

- YC company info is public on `ycombinator.com/companies` — we cite via
  `source_url`, do **not** redistribute YC's content. Each case stores
  only the verbatim public profile + our own annotations.
- Coursera (the extended case) profile sourced from `about.coursera.org`,
  also public.
- Our annotations + scoring scripts are part of this repo (whatever
  license the repo carries).

## How to run an eval

After J.4 (LLM judge wired) and J.5++ (Starlink-vs-baselines runner), three CLIs exist:

```sh
# Build first
pnpm --filter @starlink/server build

# 1. Smoke-test the judge alone (calibration: echo / null / generic)
DEEPSEEK_API_KEY=sk-... \
  node packages/server/dist/benchmark/eval/yc-judge-smoke.js --all

# 2. Real Starlink-vs-baseline comparison on 5 cases
DATABASE_URL="postgres://nobody:nobody@127.0.0.1:5432/nodb" \
DEEPSEEK_API_KEY=sk-... LLM_API_KEY=sk-... \
LLM_BASE_URL=https://api.deepseek.com/v1 LLM_MODEL=deepseek-chat \
ORCHESTRATION_MODE=registry HITL_ENABLED=false \
LANGGRAPH_CHECKPOINTER_ENABLED=false \
  node packages/server/dist/benchmark/eval/yc-vs-runners.js

# 3. Single case for fast iteration
... yc-vs-runners.js --case=yc-stripe-2024 --runners=gpt-solo
```

## J.5++ baseline results (2026-04-27, latest N=8)

Real "Starlink vs single-LLM" measurement on Tier-A YC cases.
Full report: `benchmark/reports/yc-vs-runners-20260427-131446.md`.

### N=8 (current)

| runner | mean total | mean avg | mean output | mean duration |
|---|---|---|---|---|
| **starlink** | **20.3 / 27** | **2.25** | 5143 chars | 37.0s |
| gpt-solo | 18.4 / 27 | 2.04 | 920 chars | 12.5s |

Starlink wins **7 of 8 cases** (sole gpt-solo win: DoorDash, by 1 point).

### Systematic finding — single-LLM dimensional drop

**gpt-solo scored 0 on Key Partnerships in 8 of 8 cases.** The single
LLM JSON output structurally omits 重要合作 (Key Partnerships) from
its 9-cell BMC, regardless of company / sector / outcome.

Starlink's multi-agent forces 9-dim coverage because each generator
has assigned dimensions (market-agent owns CS / CR / CH / KP, etc.) —
KP cannot be silently dropped. This is the cleanest paper-friendly
architectural advantage that fell out of N=8 evaluation:

| runner | KP score frequency at N=8 |
|---|---|
| starlink | 2 / 2 / 3 / 2 / 3 / 2 / 2 / 2 (mean 2.25) |
| gpt-solo | 0 / 0 / 0 / 0 / 0 / 0 / 0 / 0 (mean 0.00) |

### Trend across N

| N | Starlink mean | gpt-solo mean | gap | Starlink win-rate |
|---|---|---|---|---|
| 5 (initial) | 20.4 | 19.8 | 0.6 | 3/5 = 60% |
| 8 (latest) | 20.3 | 18.4 | 1.9 | 7/8 = 88% |

The gap **widened** as N grew, which is consistent with a real
architectural effect rather than judge-LLM noise.
