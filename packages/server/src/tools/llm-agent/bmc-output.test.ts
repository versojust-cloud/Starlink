import assert from 'node:assert/strict'
import test from 'node:test'
import { parseBmcAnalysisOutput } from './bmc-output.js'

test('parseBmcAnalysisOutput accepts plain JSON BMC analysis', () => {
  const parsed = parseBmcAnalysisOutput(JSON.stringify({
    bmcCards: [
      {
        domain: '客户细分',
        content: '面向准备考研且愿意付费的大学生。',
        confidence: 0.82
      }
    ]
  }))

  assert.equal(parsed.bmcCards.length, 1)
  assert.equal(parsed.bmcCards[0].domain, '客户细分')
})

test('parseBmcAnalysisOutput extracts fenced JSON', () => {
  const parsed = parseBmcAnalysisOutput(`\`\`\`json
{
  "bmcCards": [
    { "domain": "重要合作", "content": "与高校社群和学习博主合作。", "confidence": 0.7 }
  ]
}
\`\`\``)

  assert.equal(parsed.bmcCards[0].domain, '重要合作')
})

test('parseBmcAnalysisOutput rejects fake fallback domains', () => {
  assert.throws(
    () => parseBmcAnalysisOutput(JSON.stringify({
      bmcCards: [
        { domain: '综合分析', content: '未结构化输出', confidence: 0.5 }
      ]
    })),
    /Invalid enum value/
  )
})

