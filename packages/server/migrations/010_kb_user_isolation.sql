-- 010 · KB per-user visibility + RLS
--
-- Currently kb_definitions has workspace_id but no owner; kb_chunks has
-- only kb_id (chunk visibility piggy-backs on KB membership). Result:
-- any workspace member can search any KB in that workspace, even if it
-- was uploaded with private intent.
--
-- This migration:
--   1. Adds owner_user_id + visibility to kb_definitions
--   2. Mirrors workspace_id + owner_user_id + visibility into kb_chunks
--      (denormalised so vector search WHERE clauses don't have to JOIN)
--   3. Backfills both tables from existing rows
--   4. Enables RLS on kb_chunks with policies for the three visibility
--      modes
--
-- Visibility levels:
--   - 'private'   : only the owner can search this KB (default for
--                   user uploads of personal documents)
--   - 'workspace' : any workspace member can search (default for
--                   project-wide reference materials)
--   - 'global'    : every authenticated user across all workspaces
--                   (curated common knowledge — admin-set only)
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE POLICY guarded by
-- DROP IF EXISTS.

BEGIN;

-- ---------------------------------------------------------------------
-- kb_definitions  ·  owner + visibility
-- ---------------------------------------------------------------------

ALTER TABLE kb_definitions
  ADD COLUMN IF NOT EXISTS owner_user_id TEXT,
  ADD COLUMN IF NOT EXISTS visibility    TEXT;

-- Backfill: any existing KB without an owner becomes 'workspace'-shared
-- (legacy behaviour preserved). The owner column gets a sentinel that's
-- distinct from the user-level sentinels in migration 008. Operators can
-- later assign real owner_user_id values via UPDATE.
UPDATE kb_definitions
   SET owner_user_id = COALESCE(owner_user_id, '__legacy__'),
       visibility    = COALESCE(visibility,    'workspace');

ALTER TABLE kb_definitions
  ALTER COLUMN visibility SET NOT NULL,
  ALTER COLUMN visibility SET DEFAULT 'workspace';

-- Constraint check
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'kb_definitions_visibility_check'
  ) THEN
    ALTER TABLE kb_definitions
      ADD CONSTRAINT kb_definitions_visibility_check
        CHECK (visibility IN ('private', 'workspace', 'global'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_kb_definitions_owner_visibility
  ON kb_definitions (owner_user_id, visibility);

-- ---------------------------------------------------------------------
-- kb_chunks  ·  denormalised owner + visibility for fast WHERE-filter
-- ---------------------------------------------------------------------

ALTER TABLE kb_chunks
  ADD COLUMN IF NOT EXISTS workspace_id   TEXT,
  ADD COLUMN IF NOT EXISTS owner_user_id  TEXT,
  ADD COLUMN IF NOT EXISTS visibility     TEXT;

-- Backfill from parent kb_definitions (no JOIN needed — kb_chunks.kb_id
-- already references kb_definitions.id even though there's no FK).
UPDATE kb_chunks c
   SET workspace_id  = kb.workspace_id,
       owner_user_id = kb.owner_user_id,
       visibility    = kb.visibility
  FROM kb_definitions kb
 WHERE c.kb_id = kb.id
   AND (c.workspace_id IS NULL OR c.owner_user_id IS NULL OR c.visibility IS NULL);

-- Any orphan chunks (kb deleted but chunks lingered) get 'workspace'
-- visibility + sentinel owner so they remain queryable for cleanup.
UPDATE kb_chunks
   SET workspace_id  = COALESCE(workspace_id, '__orphan__'),
       owner_user_id = COALESCE(owner_user_id, '__orphan__'),
       visibility    = COALESCE(visibility, 'workspace');

ALTER TABLE kb_chunks
  ALTER COLUMN workspace_id  SET NOT NULL,
  ALTER COLUMN owner_user_id SET NOT NULL,
  ALTER COLUMN visibility    SET NOT NULL,
  ALTER COLUMN visibility    SET DEFAULT 'workspace';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'kb_chunks_visibility_check'
  ) THEN
    ALTER TABLE kb_chunks
      ADD CONSTRAINT kb_chunks_visibility_check
        CHECK (visibility IN ('private', 'workspace', 'global'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_kb_chunks_workspace
  ON kb_chunks (workspace_id);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_owner
  ON kb_chunks (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_visibility
  ON kb_chunks (visibility);

-- ---------------------------------------------------------------------
-- RLS on kb_chunks
-- ---------------------------------------------------------------------
-- The policy expression mirrors the application-side filter in
-- searchKnowledgeBase(): a chunk is visible when
--   - visibility='global', OR
--   - visibility='workspace' AND user is in workspace (we approximate
--     this by trusting that the application already passed the
--     correct workspaceId in its WHERE; RLS just enforces ownership
--     at the user_id level), OR
--   - visibility='private' AND owner_user_id = current_user
--
-- Like memory_items, when current_user_id is empty the policy returns
-- all rows (admin/maintenance bypass).

ALTER TABLE kb_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_chunks FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kb_chunks_visibility_isolation ON kb_chunks;
CREATE POLICY kb_chunks_visibility_isolation ON kb_chunks
  FOR ALL
  USING (
    -- Admin/system bypass when no user context is set
    coalesce(current_setting('app.current_user_id', true), '') = ''
    -- Global KBs are visible to everyone
    OR visibility = 'global'
    -- Private KBs only to their owner
    OR (visibility = 'private' AND owner_user_id = current_setting('app.current_user_id', true))
    -- Workspace KBs visible regardless of which user (application enforces
    -- workspace membership separately via assertWorkspacePermission).
    OR visibility = 'workspace'
  )
  WITH CHECK (
    coalesce(current_setting('app.current_user_id', true), '') = ''
    OR owner_user_id = current_setting('app.current_user_id', true)
  );

COMMIT;
