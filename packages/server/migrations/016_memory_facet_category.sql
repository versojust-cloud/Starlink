-- =============================================================================
-- Migration 016 · Memory layer / facet / category column model (P14 Sprint 1)
-- =============================================================================
-- Adds three new columns to memory_items:
--
--   layer    — 'session' | 'workspace' | 'user' | 'global'
--              (where this memory lives in the 5-layer hierarchy; 'global' is
--              reserved for kb_chunks but we keep it in the enum so unified
--              retrieval can refer to a single layer column.)
--
--   facet    — 'episodic' | 'semantic' | 'procedural'
--              (cognitive-science categorization of memory content.)
--
--   category — free-form business term within a (layer, facet) tuple
--              ('bmc-summary', 'user-skill', 'canvas-snapshot', 'decision',
--               'workspace-fact', 'user-preference', 'chat-message', ...).
--
-- The legacy `kind` and `scope` columns are KEPT for the 6-month deprecation
-- window so old read paths continue to work while callers migrate to the new
-- schema. Both old + new are populated on write during the window; reads can
-- choose either column.
--
-- Backfill rules:
--
--   scope          → layer
--   --------       ----------
--   'workspace'    'workspace'
--   'user'         'user'
--   'agent'        'workspace'   (dead enum value; coerce to workspace)
--
--   kind            → facet         category
--   ----            -----           --------
--   'summary'        episodic       bmc-summary
--   'canvas'         episodic       canvas-snapshot
--   'decision'       episodic       decision
--   'user-skill'     semantic       user-skill
--   'preference'     semantic       user-preference   (dead enum)
--   'insight'        semantic       workspace-fact     (dead enum)
--   'constraint'     semantic       user-constraint    (dead enum)
-- =============================================================================

ALTER TABLE memory_items
  ADD COLUMN IF NOT EXISTS layer TEXT,
  ADD COLUMN IF NOT EXISTS facet TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT;

-- Backfill in one statement so we don't leave partial state on a crash.
UPDATE memory_items SET
  layer = CASE
    WHEN scope = 'user' THEN 'user'
    WHEN scope = 'workspace' THEN 'workspace'
    ELSE 'workspace'  -- 'agent' (dead enum) → workspace
  END,
  facet = CASE
    WHEN kind IN ('summary', 'canvas', 'decision') THEN 'episodic'
    WHEN kind IN ('user-skill', 'preference', 'insight', 'constraint') THEN 'semantic'
    ELSE 'episodic'
  END,
  category = CASE
    WHEN kind = 'summary' THEN 'bmc-summary'
    WHEN kind = 'canvas' THEN 'canvas-snapshot'
    WHEN kind = 'decision' THEN 'decision'
    WHEN kind = 'user-skill' THEN 'user-skill'
    WHEN kind = 'preference' THEN 'user-preference'
    WHEN kind = 'insight' THEN 'workspace-fact'
    WHEN kind = 'constraint' THEN 'user-constraint'
    ELSE kind
  END
WHERE layer IS NULL OR facet IS NULL OR category IS NULL;

-- Now NOT NULL constraints — zero rows should violate after backfill.
ALTER TABLE memory_items
  ALTER COLUMN layer SET NOT NULL,
  ALTER COLUMN facet SET NOT NULL,
  ALTER COLUMN category SET NOT NULL;

-- Defensive enum-style CHECK constraints. These are advisory at the DB level
-- (not Postgres ENUM type) so we can extend the value set without ALTERing
-- the type. The application also enforces via Zod schemas in
-- packages/shared/src/schemas/memory.ts.
ALTER TABLE memory_items
  ADD CONSTRAINT memory_items_layer_check
    CHECK (layer IN ('session', 'workspace', 'user', 'global')),
  ADD CONSTRAINT memory_items_facet_check
    CHECK (facet IN ('episodic', 'semantic', 'procedural'));

-- Index for the canonical retrieve query: filter by workspace + layer + facet,
-- ordered by recency. Replaces idx_memory_items_workspace_kind for the
-- new-API consumers; the old index stays in place for legacy callers.
CREATE INDEX IF NOT EXISTS idx_memory_items_layer_facet
  ON memory_items (workspace_id, layer, facet, updated_at DESC)
  WHERE archived_at IS NULL;

-- Category-only filter (e.g. "all bmc-summary across this workspace").
CREATE INDEX IF NOT EXISTS idx_memory_items_workspace_category
  ON memory_items (workspace_id, category, updated_at DESC)
  WHERE archived_at IS NULL;

-- User-level cross-workspace category filter (e.g. "all user-skill rows").
CREATE INDEX IF NOT EXISTS idx_memory_items_user_category
  ON memory_items (user_id, category, updated_at DESC)
  WHERE archived_at IS NULL AND user_id IS NOT NULL;

COMMENT ON COLUMN memory_items.layer IS
  'Layer in the 5-layer memory hierarchy. Coexists with `scope` during the 6-month deprecation window (added 2026-05-09 as part of P14).';
COMMENT ON COLUMN memory_items.facet IS
  'Cognitive-science facet (episodic / semantic / procedural). Replaces the content-type axis previously conflated into `kind`.';
COMMENT ON COLUMN memory_items.category IS
  'Free-form business term within a (layer, facet) tuple. Replaces the lifecycle axis previously conflated into `kind`.';
