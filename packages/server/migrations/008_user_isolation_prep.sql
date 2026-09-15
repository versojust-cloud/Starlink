-- 008 · Per-user isolation prep
--
-- Re-asserts required PG extensions (idempotent — safe on existing DBs)
-- and tightens user_id columns ahead of Row Level Security in 011.
--
-- Why this is split from 011: making user_id NOT NULL needs a backfill
-- pass for any historical rows that were written before user attribution
-- was strict. Running RLS enable AFTER backfill is the safe order — if
-- we did them together a NULL user_id row would become invisible.
--
-- Idempotent: each statement either uses IF NOT EXISTS / IF EXISTS or is
-- naturally repeatable (constraint check / UPDATE WHERE NULL).

BEGIN;

-- Extensions (re-asserted; no-op if already installed by 001)
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------
-- memory_items.user_id  ·  currently NULLABLE → make NOT NULL
-- ---------------------------------------------------------------------

-- Backfill: any row with NULL user_id is "system" memory. Mark it with
-- a sentinel so RLS policies can grant operators visibility without
-- exposing rows to end-user queries.
UPDATE memory_items
   SET user_id = '__system__'
 WHERE user_id IS NULL;

ALTER TABLE memory_items
  ALTER COLUMN user_id SET NOT NULL;

-- Composite index for user+workspace lookups (common access pattern)
CREATE INDEX IF NOT EXISTS idx_memory_items_user_workspace
  ON memory_items (user_id, workspace_id, updated_at DESC)
  WHERE archived_at IS NULL;

-- ---------------------------------------------------------------------
-- conversation_messages.user_id  ·  currently NULLABLE → make NOT NULL
-- ---------------------------------------------------------------------

-- Backfill from parent session (conversation_messages without user_id
-- inherit from their conversation_sessions row, which is already strict).
UPDATE conversation_messages cm
   SET user_id = cs.user_id
  FROM conversation_sessions cs
 WHERE cm.conversation_id = cs.id
   AND cm.user_id IS NULL;

-- Sentinel for any orphans (parent session deleted but message lingered)
UPDATE conversation_messages
   SET user_id = '__orphan__'
 WHERE user_id IS NULL;

ALTER TABLE conversation_messages
  ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversation_messages_user_created
  ON conversation_messages (user_id, created_at DESC);

-- ---------------------------------------------------------------------
-- conversation_sessions  ·  user_id already NOT NULL (per 003); add
-- composite index for "list my sessions in workspace W" pattern.
-- ---------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_conversation_sessions_user_workspace
  ON conversation_sessions (user_id, workspace_id, updated_at DESC);

COMMIT;
