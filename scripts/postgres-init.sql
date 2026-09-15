-- pgvector extension is required for the KB / memory vector search paths.
-- Runs once when the PG data dir is initialised (via docker-entrypoint-initdb.d).
CREATE EXTENSION IF NOT EXISTS vector;
