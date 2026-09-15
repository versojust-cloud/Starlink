/**
 * Ideation Coach — shared module (Wave F.2-F.4).
 *
 * Cross-runtime (apps/web Next.js + packages/server Apollo) shared
 * prompt templates + Zod schemas + JSON parsers for the Meflex-style
 * scaffolded coach.
 *
 * Importers:
 *   - `apps/web/app/api/ideation/reflect/route.ts` (Next.js REST)
 *   - `packages/server/src/graphql/...` (Apollo, F.5+ — pending)
 *
 * Each runtime owns its own HTTP call to the LLM provider; this module
 * provides everything else (prompt, schema, parse logic).
 *
 * See docs/architecture/F-graphql-gateway-strategy.md for the full ADR.
 */

export * from './schemas.js'
export * from './prompts.js'
export * from './parser.js'
export * from './wizard-schemas.js'
export * from './wizard-prompts.js'
export * from './wizard-parser.js'
