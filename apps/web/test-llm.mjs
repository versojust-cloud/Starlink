/**
 * 快速测试 LLM API 是否可用
 */

const API_KEY = 'sk-9K6pQ8oOSCJUQc7MF5B82bCbA4944a8eBe5d0596B87448A8'
const BASE_URL = 'https://apiflow.cc/v1'
const MODEL = 'Qwen/Qwen3-235B-A22B-Instruct-2507'

async function testLLM() {
  console.log('🧪 测试 LLM API...\n')
  console.log(`📍 Base URL: ${BASE_URL}`)
  console.log(`🤖 Model: ${MODEL}`)
  console.log(`🔑 API Key: ${API_KEY.substring(0, 20)}...\n`)

  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: '你是一个有帮助的助手。' },
          { role: 'user', content: '你好，请用一句话介绍你自己。' }
        ],
        temperature: 0.7
      })
    })

    console.log(`📡 HTTP 状态: ${response.status} ${response.statusText}\n`)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ API 调用失败:')
      console.error(errorText)
      return
    }

    const data = await response.json()

    console.log('✅ API 调用成功!\n')
    console.log('📝 返回数据结构:')
    console.log(JSON.stringify(data, null, 2))

    if (data.choices && data.choices[0]) {
      console.log('\n💬 LLM 回复:')
      console.log(data.choices[0].message.content)
    }

    if (data.usage) {
      console.log('\n📊 Token 使用:')
      console.log(`   输入: ${data.usage.prompt_tokens}`)
      console.log(`   输出: ${data.usage.completion_tokens}`)
      console.log(`   总计: ${data.usage.total_tokens}`)
    }

  } catch (error) {
    console.error('❌ 测试失败:')
    console.error(error)
  }
}

testLLM()
