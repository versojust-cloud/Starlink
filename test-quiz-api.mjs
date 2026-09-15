/**
 * Test Quiz Generation API
 * 测试 Quiz 生成 API 是否正常工作
 */

async function testQuizAPI() {
  console.log('🧪 测试 Quiz 生成 API...\n')

  const testPayload = {
    nodeLabel: '线上订阅服务',
    nodeDomain: '收入来源 (Revenue Streams)',
    nodeContent: `
我们的主要收入来源是线上订阅服务。用户可以选择月度或年度订阅计划。

**月度订阅**: ¥99/月
- 提供完整功能访问
- 不限制使用次数
- 优先客户支持

**年度订阅**: ¥999/年（相当于 ¥83.25/月）
- 享受 16% 折扣
- 所有月度订阅权益
- 额外获得专属定制服务

通过这种订阅模式，我们能够建立稳定的经常性收入（MRR），同时激励用户选择年度订阅以提高客户生命周期价值（LTV）。
    `.trim()
  }

  try {
    console.log('📤 发送请求到 http://localhost:3000/api/quiz')
    console.log('📦 请求数据:')
    console.log(JSON.stringify(testPayload, null, 2))
    console.log('\n⏳ 等待 AI 生成...\n')

    const response = await fetch('http://localhost:3002/api/quiz', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testPayload)
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API 返回错误: ${response.status} - ${errorText}`)
    }

    const questions = await response.json()

    console.log('✅ Quiz 生成成功！\n')
    console.log(`📋 共生成 ${questions.length} 道问题:\n`)

    questions.forEach((q, idx) => {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
      console.log(`问题 ${idx + 1} [${q.difficulty.toUpperCase()}]`)
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
      console.log(`\n❓ ${q.question}\n`)
      q.options.forEach((opt, optIdx) => {
        const marker = optIdx === q.correctAnswer ? '✓' : ' '
        console.log(`   ${String.fromCharCode(65 + optIdx)}. [${marker}] ${opt}`)
      })
      console.log(`\n💡 解释: ${q.explanation}\n`)
    })

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🎉 测试完成！Quiz API 工作正常！')

  } catch (error) {
    console.error('❌ 测试失败:', error.message)
    process.exit(1)
  }
}

// 运行测试
testQuizAPI()
