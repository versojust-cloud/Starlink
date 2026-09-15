-- 015 · HITL resume directive persistence
--
-- P11.16: persist the human-in-the-loop resume directive on the session
-- row instead of only in an in-memory Map. The previous design lost any
-- pending directive on gateway restart because:
--
--   1. user clicks `approveDecision` on a paused conversation
--   2. gateway crashes (or process restart for deploy / OOM kill)
--   3. user resumes; LangGraph stream restarts via thread_id, the
--      checkpointer restores BusinessState, BUT
--   4. hitlResumeDirectives Map was empty → supervisor falls back to
--      auto-revision, ignoring the human's decision
--
-- New column receives the JSON-serialised HitlResumeDirective. The
-- service-layer setHitlResumeDirective writes BOTH the in-memory Map
-- (fast path) AND this column (durable). consumeHitlResumeDirective
-- reads + clears the row atomically.
--
-- Idempotent — uses ADD COLUMN IF NOT EXISTS so re-running is safe.

ALTER TABLE conversation_sessions
  ADD COLUMN IF NOT EXISTS hitl_directive JSONB;
