/**
 * 测试深度研究 API
 */

const BASE_URL = 'http://localhost:3000'

async function testDeepResearch() {
  console.log('🧪 测试深度研究 API...\n')

  console.log('📋 测试研究请求...')

  const response = await fetch(`${BASE_URL}/api/deep-research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: '人工智能在医疗领域的应用现状和未来发展趋势',
      researchType: 'comprehensive',
      depth: 'medium',
      sources: ['academic', 'news'],
      language: 'zh'
    })
  })

  if (!response.ok) {
    console.log(`❌ API 调用失败: ${response.status} ${response.statusText}`)
    const error = await response.text()
    console.log('错误详情:', error)
    return
  }

  const data = await response.json()

  console.log('\n✅ API 调用成功!')
  console.log('\n📝 返回数据结构:')
  console.log('- result.summary:', data.result?.summary?.substring(0, 100) + '...')
  console.log('- result.keyPoints:', data.result?.keyPoints?.length, '个关键发现')
  console.log('- result.sources:', data.result?.sources?.length, '个信息来源')
  console.log('- result.recommendations:', data.result?.recommendations?.length || 0, '条建议')

  if (data.result?.keyPoints) {
    console.log('\n🔍 关键发现:')
    data.result.keyPoints.forEach((point, i) => {
      console.log(`  ${i + 1}. ${point.substring(0, 80)}...`)
    })
  }

  if (data.result?.sources) {
    console.log('\n📚 信息来源:')
    data.result.sources.forEach((source, i) => {
      console.log(`  ${i + 1}. ${source}`)
    })
  }

  if (data.result?.recommendations) {
    console.log('\n💡 建议:')
    data.result.recommendations.forEach((rec, i) => {
      console.log(`  ${i + 1}. ${rec}`)
    })
  }

  console.log('\n📊 详细分析预览:')
  console.log(data.result?.detailedAnalysis?.substring(0, 300) + '...')
}

async function main() {
  try {
    await testDeepResearch()
    console.log('\n\n✅ 测试完成!')
  } catch (error) {
    console.error('\n❌ 测试失败:')
    console.error(error)
  }
}

main()
