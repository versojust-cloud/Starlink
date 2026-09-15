-- =============================================================================
-- Migration 017 · Split conversation_sessions into conversations + runs
-- =============================================================================
-- Conceptual restructure (P14 Sprint 3):
--
--   BEFORE                          AFTER
--   ──────                          ─────
--   conversation_sessions           conversations  (long-lived: user-on-canvas)
--                                   + runs         (30-90s: one LangGraph stream)
--
-- The legacy conversation_sessions table mixed three layers of "session":
--
--   1. Long-lived user-on-canvas state  (open / closed)
--   2. Runtime LangGraph stream lifecycle (heartbeat, owner_pid, status)
--   3. HITL directive + wizard state    (per-stream concerns)
--
-- This made cancelActiveSession / reattachToActiveSession / HITL recurrence
-- bugs systemic — the same row was reset across three different lifecycles.
--
-- New model:
--
--   conversations              ← user is "on the canvas" (long-lived)
--   ├─ current_run_id           pointer to latest active run
--   └─ id, workspace_id, user_id, title, status, opened_at, closed_at
--
--   runs                       ← one LangGraph streaming pass (30-90s)
--   ├─ conversation_id          FK
--   ├─ langgraph_thread_id      ties to PostgresSaver checkpoints
--   └─ id, status, latest_question, context_snapshot, heartbeat_at,
--      owner_pid, hitl_directive, started_at, completed_at
--
-- Backfill rule: every existing conversation_sessions row becomes ONE
-- conversation + ONE run with id suffix '-r1'. conversation_messages keep
-- their conversation_id reference (same id as before).
-- =============================================================================

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',          -- 'open' | 'closed'
  current_run_id TEXT,                          -- FK to runs.id, nullable
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_conversations_workspace_opened
  ON conversations (workspace_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_user_opened
  ON conversations (user_id, opened_at DESC);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,                          -- 'queued' | 'streaming' | 'waiting-hitl' | 'completed' | 'failed' | 'cancelled'
  langgraph_thread_id TEXT,
  latest_question TEXT,
  context_snapshot JSONB NOT NULL DEFAULT '{}',
  heartbeat_at TIMESTAMPTZ,
  owner_pid TEXT,
  hitl_directive JSONB,
  failure_reason TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_runs_conversation_started
  ON runs (conversation_id, started_at DESC);

-- Match the heartbeat-driven reaper query — find stale running rows fast.
CREATE INDEX IF NOT EXISTS idx_runs_active_heartbeat
  ON runs (workspace_id, heartbeat_at NULLS FIRST)
  WHERE status IN ('queued', 'streaming', 'waiting-hitl');

-- ─── Backfill ────────────────────────────────────────────────────────────────

-- conversations: 1:1 from conversation_sessions
INSERT INTO conversations (id, workspace_id, user_id, title, status, opened_at, closed_at, metadata)
SELECT
  id,
  workspace_id,
  user_id,
  title,
  CASE WHEN completed_at IS NOT NULL THEN 'closed' ELSE 'open' END,
  created_at,
  completed_at,
  '{}'::jsonb
FROM conversation_sessions
ON CONFLICT (id) DO NOTHING;

-- runs: 1:1 from conversation_sessions, with id suffix '-r1' to distinguish.
-- Map old `status` ('running' / 'completed' / 'failed' / 'archived') to the
-- new run-level enum.
INSERT INTO runs (
  id, conversation_id, workspace_id, user_id, status, latest_question,
  context_snapshot, heartbeat_at, owner_pid, hitl_directive, failure_reason,
  started_at, completed_at, metadata
)
SELECT
  id || '-r1' AS id,
  id AS conversation_id,
  workspace_id,
  user_id,
  CASE
    WHEN status = 'running'   THEN 'streaming'
    WHEN status = 'completed' THEN 'completed'
    WHEN status = 'failed'    THEN 'failed'
    WHEN status = 'archived'  THEN 'cancelled'
    ELSE status
  END AS status,
  latest_question,
  context_snapshot,
  heartbeat_at,
  owner_pid,
  hitl_directive,
  failure_reason,
  created_at,
  completed_at,
  '{}'::jsonb
FROM conversation_sessions
ON CONFLICT (id) DO NOTHING;

-- Set conversations.current_run_id to the (one and only) backfilled run.
UPDATE conversations c
SET current_run_id = c.id || '-r1'
WHERE current_run_id IS NULL
  AND EXISTS (SELECT 1 FROM runs r WHERE r.id = c.id || '-r1');

-- ─── Foreign-key + deprecation comment ───────────────────────────────────────

-- conversation_messages.conversation_id continues to reference the same id
-- (still in the new conversations table), so the existing FK constraint to
-- conversation_sessions(id) needs to be dropped + recreated against
-- conversations(id). Note: pgsql ON DELETE CASCADE preserved.
ALTER TABLE conversation_messages
  DROP CONSTRAINT IF EXISTS conversation_messages_conversation_id_fkey;
ALTER TABLE conversation_messages
  ADD CONSTRAINT conversation_messages_conversation_id_fkey
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

COMMENT ON TABLE conversation_sessions IS
  'DEPRECATED P14 P3 (2026-05-09) — superseded by conversations + runs split. Read-only legacy table; safe to DROP after 2026-11-09 once all environments confirm zero residual reads.';
