CREATE TABLE IF NOT EXISTS conversation_sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  latest_question TEXT,
  context_snapshot JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_conversation_sessions_workspace_updated
  ON conversation_sessions (workspace_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_sessions_user_updated
  ON conversation_sessions (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL,
  user_id TEXT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation_created
  ON conversation_messages (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_workspace_created
  ON conversation_messages (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS memory_items (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT,
  scope TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(1536),
  embedding_model TEXT,
  embedding_dimensions INTEGER,
  source_type TEXT NOT NULL,
  source_id TEXT,
  importance DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0.7,
  tags TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ
);

ALTER TABLE memory_items ADD COLUMN IF NOT EXISTS embedding VECTOR(1536);
ALTER TABLE memory_items ADD COLUMN IF NOT EXISTS embedding_model TEXT;
ALTER TABLE memory_items ADD COLUMN IF NOT EXISTS embedding_dimensions INTEGER;

CREATE INDEX IF NOT EXISTS idx_memory_items_workspace_updated
  ON memory_items (workspace_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_items_workspace_kind
  ON memory_items (workspace_id, kind, updated_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_memory_items_workspace_scope
  ON memory_items (workspace_id, scope, updated_at DESC)
  WHERE archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_items_source_unique
  ON memory_items (workspace_id, source_type, source_id, kind, title)
  WHERE source_id IS NOT NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_memory_items_embedding
  ON memory_items
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100)
  WHERE embedding IS NOT NULL AND archived_at IS NULL;
