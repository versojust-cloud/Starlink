-- 009 · Session heartbeat + reaper readiness
--
-- Adds the columns needed for the session-reaper script (P1) to
-- distinguish between live sessions (heartbeat fresh) and crashed
-- gateway leftovers (heartbeat stale or missing).
--
-- Workflow:
--   1. createSession() — heartbeat_at is NULL, owner_pid set to gateway uuid
--   2. createBusinessStream() — sets up a 30s timer calling touchHeartbeat()
--   3. Stream ends (success/failure) — updateSessionStatus() clears heartbeat
--   4. Gateway crashes — heartbeat stops updating; reaper sees stale row
--   5. Reaper marks status='failed' with failure_reason='heartbeat-lost'
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.

BEGIN;

ALTER TABLE conversation_sessions
  ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS owner_pid TEXT,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT;

-- Index for reaper scans: "find sessions where heartbeat is stale".
-- The WHERE clause keeps the index small (only running sessions).
CREATE INDEX IF NOT EXISTS idx_conversation_sessions_running_heartbeat
  ON conversation_sessions (heartbeat_at NULLS FIRST)
  WHERE status = 'running';

COMMIT;
