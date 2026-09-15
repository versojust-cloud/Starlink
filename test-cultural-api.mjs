/**
 * 测试 Cultural Tools API
 */

const BASE_URL = 'http://localhost:3000'

async function testSimulationsAPI() {
  console.log('🧪 测试 Simulations API...\n')

  // 1. 测试 GET - 获取场景列表
  console.log('📋 Step 1: 获取场景列表...')
  const getResponse = await fetch(`${BASE_URL}/api/cultural/simulations`)
  const scenarios = await getResponse.json()
  console.log(`✅ 获取到 ${scenarios.scenarios?.length || 0} 个场景`)
  console.log('场景列表:', scenarios.scenarios?.map(s => s.title).join(', '))

  if (!scenarios.scenarios || scenarios.scenarios.length === 0) {
    console.log('❌ 没有可用场景')
    return
  }

  // 2. 测试 POST - 发送消息
  console.log('\n💬 Step 2: 测试跨文化对话...')
  const scenarioId = scenarios.scenarios[0].id
  console.log(`选择场景: ${scenarios.scenarios[0].title}`)

  const postResponse = await fetch(`${BASE_URL}/api/cultural/simulations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scenarioId,
      message: '您好，我想讨论一下合作的可能性',
      history: []
    })
  })

  if (!postResponse.ok) {
    console.log(`❌ API 调用失败: ${postResponse.status} ${postResponse.statusText}`)
    const error = await postResponse.text()
    console.log('错误详情:', error)
    return
  }

  const result = await postResponse.json()

  console.log('\n✅ API 调用成功!')
  console.log('\n📝 返回数据结构:')
  console.log('- scenario:', result.scenario?.title)
  console.log('- reply:', result.reply?.substring(0, 100) + '...')
  console.log('- insights:', result.insights?.length, '条建议')
  console.log('- resources:', result.resources?.length, '个参考资料')
  console.log('- quickReplies:', result.quickReplies?.length, '个快速回复')

  if (result.insights) {
    console.log('\n💡 情境建议:')
    result.insights.forEach(insight => {
      console.log(`  - ${insight.title}: ${insight.detail.substring(0, 50)}...`)
    })
  }

  if (result.quickReplies) {
    console.log('\n💬 快速回复建议:')
    result.quickReplies.forEach(reply => {
      console.log(`  - ${reply}`)
    })
  }
}

async function testReportsAPI() {
  console.log('\n\n🧪 测试 Reports API...\n')

  // 1. 测试 GET - 获取模板列表
  console.log('📋 Step 1: 获取报告模板...')
  const getResponse = await fetch(`${BASE_URL}/api/cultural/reports`)
  const data = await getResponse.json()
  console.log(`✅ 获取到 ${data.templates?.length || 0} 个模板`)
  console.log('模板列表:', data.templates?.map(t => t.name).join(', '))

  if (!data.templates || data.templates.length === 0) {
    console.log('❌ 没有可用模板')
    return
  }

  // 2. 测试 POST - 生成报告（draft）
  console.log('\n📄 Step 2: 测试报告生成（草稿）...')
  const templateId = data.templates[0].id
  console.log(`选择模板: ${data.templates[0].name}`)

  const postResponse = await fetch(`${BASE_URL}/api/cultural/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      templateId,
      source: '我们计划在亚太市场推出新产品，需要评估文化适配性和本地化策略。目标市场包括中国、日本、韩国。',
      tone: '正式',
      ensureNeutrality: true,
      applyFormatting: true,
      action: 'draft'
    })
  })

  if (!postResponse.ok) {
    console.log(`❌ API 调用失败: ${postResponse.status} ${postResponse.statusText}`)
    const error = await postResponse.text()
    console.log('错误详情:', error)
    return
  }

  const result = await postResponse.json()

  console.log('\n✅ API 调用成功!')
  console.log('\n📝 返回数据:')
  console.log('- title:', result.title)
  console.log('- template:', result.template?.name)
  console.log('- formattingApplied:', result.formattingApplied)
  console.log('- neutralityChecked:', result.neutralityChecked)
  console.log('\n📄 生成内容预览:')
  console.log(result.content?.substring(0, 300) + '...')
}

async function main() {
  try {
    await testSimulationsAPI()
    await testReportsAPI()

    console.log('\n\n✅ 所有测试完成!')
  } catch (error) {
    console.error('\n❌ 测试失败:')
    console.error(error)
  }
}

main()
