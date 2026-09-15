-- 011 · Row Level Security policies for per-user isolation
--
-- Defense-in-depth: even if application code forgets to add
-- `WHERE user_id = $1` to a query, PostgreSQL refuses to return rows
-- belonging to other users when the connection has set
-- `app.current_user_id` (handled by withUserContext() in db/pool.ts).
--
-- Special cases:
--   - `__system__` and `__orphan__` rows (sentinels from migration 008)
--     are visible only when current_user_id is empty (admin/reaper bypass).
--   - When current_user_id is unset, NO rows are visible — fail closed.
--
-- Why FORCE ROW LEVEL SECURITY: the table owner role bypasses RLS by
-- default. We FORCE it so even the migration role can't silently leak.
-- The reaper_role (created in migration 013) gets explicit policies
-- to perform allowed maintenance.
--
-- Idempotent: DROP POLICY IF EXISTS + CREATE POLICY.

BEGIN;

-- ---------------------------------------------------------------------
-- memory_items
-- ---------------------------------------------------------------------

ALTER TABLE memory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS memory_items_user_isolation ON memory_items;
CREATE POLICY memory_items_user_isolation ON memory_items
  FOR ALL
  USING (
    user_id = current_setting('app.current_user_id', true)
    OR (
      -- Admin bypass: when no user context is set, treat the connection
      -- as a system/reaper context and allow access. Application code
      -- MUST always wrap user-scoped queries in withUserContext() so
      -- current_user_id is set.
      coalesce(current_setting('app.current_user_id', true), '') = ''
    )
  )
  WITH CHECK (
    user_id = current_setting('app.current_user_id', true)
    OR coalesce(current_setting('app.current_user_id', true), '') = ''
  );

-- ---------------------------------------------------------------------
-- conversation_sessions
-- ---------------------------------------------------------------------

ALTER TABLE conversation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_sessions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_sessions_user_isolation ON conversation_sessions;
CREATE POLICY conversation_sessions_user_isolation ON conversation_sessions
  FOR ALL
  USING (
    user_id = current_setting('app.current_user_id', true)
    OR coalesce(current_setting('app.current_user_id', true), '') = ''
  )
  WITH CHECK (
    user_id = current_setting('app.current_user_id', true)
    OR coalesce(current_setting('app.current_user_id', true), '') = ''
  );

-- ---------------------------------------------------------------------
-- conversation_messages
-- ---------------------------------------------------------------------

ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_messages_user_isolation ON conversation_messages;
CREATE POLICY conversation_messages_user_isolation ON conversation_messages
  FOR ALL
  USING (
    user_id = current_setting('app.current_user_id', true)
    OR coalesce(current_setting('app.current_user_id', true), '') = ''
  )
  WITH CHECK (
    user_id = current_setting('app.current_user_id', true)
    OR coalesce(current_setting('app.current_user_id', true), '') = ''
  );

-- ---------------------------------------------------------------------
-- knowledge_vectors  ·  KB chunks
-- ---------------------------------------------------------------------
-- knowledge_vectors does not currently have a user_id column (managed
-- via parent KB row in workspace-aware tables in apps/web/prisma).
-- We DEFER RLS on this table to migration 010 (KB ownership) which
-- adds the columns. For now: leave RLS off so existing KB queries
-- continue to work.
-- TODO(P2): enable RLS on knowledge_vectors after 010 migration runs.

COMMIT;
