import type { ToolRegistry } from '../tool-registry/registry.js'

export type BmcFlowRuntime = 'legacy' | 'template'

const REQUIRED_BMC_TEMPLATE_TOOLS = [
  'market_agent',
  'product_agent',
  'finance_agent',
  'aggregator',
  'critic_agent',
  'bmc_renderer'
] as const

export function readBmcFlowRuntime(): BmcFlowRuntime {
  return process.env.BMC_FLOW_RUNTIME === 'template' ? 'template' : 'legacy'
}

export function shouldUseBmcTemplateRuntime(input: {
  runtime: BmcFlowRuntime
  question: string
  toolRegistry?: Pick<ToolRegistry, 'has'> | null
}) {
  return input.runtime === 'template'
    && isLikelyBmcGenerationRequest(input.question)
    && hasBmcTemplateTools(input.toolRegistry)
}

export function isLikelyBmcGenerationRequest(question: string) {
  return /BMC|CC-BMC|商业模式|商业模型|商业画布|模式画布|business model canvas/i.test(question)
}

function hasBmcTemplateTools(toolRegistry?: Pick<ToolRegistry, 'has'> | null) {
  if (!toolRegistry) return true
  return REQUIRED_BMC_TEMPLATE_TOOLS.every((toolName) => toolRegistry.has(toolName))
}
