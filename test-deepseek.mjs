/**
 * 测试 DeepSeek API key 是否有效
 * 官方文档: https://api-docs.deepseek.com/
 */

const API_KEY = 'sk-ndnzpqisdhqdzithfspzzvgciufhtqvvfxxvsnpmwdhmkipu'
const BASE_URL = 'https://api.deepseek.com'
const MODEL = 'deepseek-chat'

async function testDeepSeek() {
  console.log('🧪 测试 DeepSeek API...\n')
  console.log(`📍 Base URL: ${BASE_URL}`)
  console.log(`🤖 Model: ${MODEL}`)
  console.log(`🔑 API Key: ${API_KEY.substring(0, 25)}...${API_KEY.substring(API_KEY.length - 4)}\n`)

  // 先测试模型列表接口
  console.log('📋 Step 1: 获取可用模型列表...')
  try {
    const modelsResponse = await fetch(`${BASE_URL}/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      }
    })

    console.log(`   HTTP 状态: ${modelsResponse.status} ${modelsResponse.statusText}`)

    if (modelsResponse.ok) {
      const models = await modelsResponse.json()
      console.log('   ✅ 模型列表获取成功:')
      console.log(JSON.stringify(models, null, 2))
    } else {
      const errorText = await modelsResponse.text()
      console.log('   ❌ 模型列表获取失败:', errorText)
    }
  } catch (error) {
    console.log('   ❌ 请求失败:', error.message)
  }

  console.log('\n💬 Step 2: 测试 Chat Completions...')
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
          { role: 'user', content: '你好,请用一句话介绍你自己。' }
        ],
        temperature: 0.7,
        max_tokens: 100
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
      console.log('\n💬 DeepSeek 回复:')
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

testDeepSeek()
