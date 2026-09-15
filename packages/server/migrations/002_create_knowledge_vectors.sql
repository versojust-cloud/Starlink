CREATE TABLE IF NOT EXISTS knowledge_vectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id TEXT NOT NULL,
  chunk TEXT NOT NULL,
  embedding VECTOR(1536) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_vectors_doc_idx ON knowledge_vectors (doc_id);
CREATE INDEX IF NOT EXISTS knowledge_vectors_ivf_idx ON knowledge_vectors USING IVFFLAT (embedding vector_l2_ops);
