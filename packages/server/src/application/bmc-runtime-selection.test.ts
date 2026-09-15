import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isLikelyBmcGenerationRequest,
  readBmcFlowRuntime,
  shouldUseBmcTemplateRuntime
} from './bmc-runtime-selection.js'

test('shouldUseBmcTemplateRuntime enables template for BMC generation requests', () => {
  assert.equal(shouldUseBmcTemplateRuntime({
    runtime: 'template',
    question: '请生成一个新能源汽车商业模式画布'
  }), true)
})

test('shouldUseBmcTemplateRuntime keeps non-BMC requests on legacy path', () => {
  assert.equal(shouldUseBmcTemplateRuntime({
    runtime: 'template',
    question: '帮我总结当前工作区重点'
  }), false)
})

test('shouldUseBmcTemplateRuntime falls back when required tools are missing', () => {
  const loaded = new Set([
    'market_agent',
    'product_agent',
    'finance_agent',
    'aggregator',
    'critic_agent'
  ])

  assert.equal(shouldUseBmcTemplateRuntime({
    runtime: 'template',
    question: '生成 CC-BMC 画布',
    toolRegistry: { has: (toolName) => loaded.has(toolName) }
  }), false)
})

test('isLikelyBmcGenerationRequest recognizes English business model canvas prompts', () => {
  assert.equal(isLikelyBmcGenerationRequest('build a business model canvas for an AI tutor'), true)
})

test('readBmcFlowRuntime defaults to legacy unless template is explicitly set', () => {
  const previous = process.env.BMC_FLOW_RUNTIME
  delete process.env.BMC_FLOW_RUNTIME
  assert.equal(readBmcFlowRuntime(), 'legacy')

  process.env.BMC_FLOW_RUNTIME = 'template'
  assert.equal(readBmcFlowRuntime(), 'template')

  if (previous === undefined) {
    delete process.env.BMC_FLOW_RUNTIME
  } else {
    process.env.BMC_FLOW_RUNTIME = previous
  }
})
