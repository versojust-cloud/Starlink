/**
 * Re-export shim (Wave F).
 *
 * The Coach RPC schemas + types now live in @starlink/shared so they
 * can be imported by both the Next.js REST route AND the (forthcoming)
 * Apollo GraphQL resolver. This file stays as a re-export so existing
 * imports under `@/features/ideation/types/coach-rpc-types` keep
 * working without code-wide rewrites.
 *
 * See docs/architecture/F-graphql-gateway-strategy.md.
 */

export {
  ReflectionRequestSchema,
  ReflectionResponseSchema,
  type ReflectionRequest,
  type ReflectionResponse,
  type ScaffoldKind
} from '@starlink/shared'
