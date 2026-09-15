-- 014 · Agent ↔ KB binding (closes the "ghost spec" identified in audit)
--
-- Background: agent.yaml has a `knowledge_bases: []` field that the
-- profile-loader parses but never reads. Result: there is no way to
-- say "the deep-research agent should always pull chunks from KB-X
-- when invoked" — the user must explicitly pass kbId on every call.
--
-- This migration introduces a binding table so any agent (identified
-- by its registry id, e.g. 'deep-research-agent') can be bound to N
-- KBs in a workspace. At agent invocation time, the runtime walks
-- this table + each KB's visibility filter to inject a fresh
-- knowledgeEvidence array.
--
-- Why a separate table (vs an agent_id column on kb_definitions):
-- many-to-many. One KB can be bound to multiple agents (e.g. a
-- "compliance reference" KB shared by critic + product-agent).
-- One agent can have multiple bound KBs (e.g. researcher pulls
-- both 'industry trends' + 'company memory').
--
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS kb_agent_bindings (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL,
  kb_id         TEXT NOT NULL,
  agent_id      TEXT NOT NULL,
  -- Owner who created this binding. We don't enforce a tight
  -- relationship to kb_definitions.owner_user_id because a workspace
  -- admin may bind a workspace-shared KB to an agent without owning
  -- the KB. Authorization is enforced at the resolver layer.
  bound_by_user_id TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Auto-search: when true, the runtime issues a kb-search query for
  -- this binding on every agent invocation. When false, the binding
  -- is "available but opt-in" — agent can reference it via tool but
  -- doesn't auto-pull. Default true matches the user expectation:
  -- "I bound this KB so the agent should USE it".
  auto_search   BOOLEAN NOT NULL DEFAULT true
);

-- Composite uniqueness — same (kb, agent) pair in same workspace
-- shouldn't appear twice. This becomes the natural upsert key.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_kb_agent_bindings_kb_agent_workspace
  ON kb_agent_bindings (workspace_id, kb_id, agent_id);

-- Lookup paths:
--   1. "give me all bindings for this agent in this workspace"
--      (runtime path during agent invocation)
CREATE INDEX IF NOT EXISTS idx_kb_agent_bindings_agent_workspace
  ON kb_agent_bindings (agent_id, workspace_id)
  WHERE auto_search = true;

--   2. "list all agents bound to this KB"
--      (used by KB UI to show "this KB is wired to N agents")
CREATE INDEX IF NOT EXISTS idx_kb_agent_bindings_kb
  ON kb_agent_bindings (kb_id);

COMMIT;
