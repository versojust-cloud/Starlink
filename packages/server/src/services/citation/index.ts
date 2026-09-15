/**
 * Citation module — cell-level citation parsing and grounding metrics.
 *
 * This is the innovation core of the Evidence-Grounded BMC system
 * (see docs/architecture-evidence-grounded-bmc.md §6).
 *
 * Public API:
 *   - parseCitations: parse LLM text with [[ref:docId#snippetId]] tokens
 *   - computeGroundingRate: fraction of text covered by citation spans
 */
export { parseCitations, computeGroundingRate } from './citation-parser.js'
