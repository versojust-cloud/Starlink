import assert from 'node:assert/strict'
import test from 'node:test'
import FinanceAgentTool from './finance-agent.tool.js'
import MarketAgentTool from './market-agent.tool.js'
import ProductAgentTool from './product-agent.tool.js'

test('domain analyst tool wrappers keep stable registry names', () => {
  assert.equal(new MarketAgentTool().definition.identity.name, 'market_agent')
  assert.equal(new ProductAgentTool().definition.identity.name, 'product_agent')
  assert.equal(new FinanceAgentTool().definition.identity.name, 'finance_agent')
})

test('market analyst keeps optional evidence input', () => {
  const market = new MarketAgentTool()

  assert.ok(market.definition.inputSchema.properties.evidence)
  assert.ok(market.definition.inputPorts.some((port) => port.name === 'evidence'))
})

test('product and finance analysts share the same BMC card output contract', () => {
  const product = new ProductAgentTool()
  const finance = new FinanceAgentTool()

  assert.deepEqual(product.definition.outputPorts, finance.definition.outputPorts)
  assert.equal(product.definition.outputSchema.properties.bmcCards instanceof Object, true)
  assert.equal(finance.definition.outputSchema.properties.bmcCards instanceof Object, true)
})

