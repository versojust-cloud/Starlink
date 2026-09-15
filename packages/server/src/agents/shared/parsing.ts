/**
 * Shared parsing helpers — thin re-exports of the legacy business-langgraph
 * helpers so YAML agents produce identical BMC node shapes.
 */

export {
  extractAndParseJSON,
  normalizeDomainNodes,
  readModelText,
  MARKET_DOMAINS,
  PRODUCT_DOMAINS,
  FINANCE_DOMAINS,
  AGENT_TYPES,
  type AgentType,
  type CCBMCDomain,
  type MacraNodeData,
  type BusinessModel
} from '../../services/business-langgraph.js'
