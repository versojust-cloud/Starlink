/**
 * 测试 DeepSeek API
 */

const API_KEY = 'sk-ndnzpqisdhqdzithfspzzvgciufhtqvvfxxvsnpmwdhmkipu'
const BASE_URL = 'https://api.deepseek.com/v1'
const MODEL = 'deepseek-chat'

async function testDeepSeek() {
  console.log('🧪 测试 DeepSeek API...\n')

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
        ]
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
    console.log('💬 DeepSeek 回复:')
    console.log(data.choices[0].message.content)

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

testDeepSeek()
