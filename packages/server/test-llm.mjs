import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'

const apiKey = process.env.LLM_API_KEY || ''
const baseURL = process.env.LLM_BASE_URL || ''
const model = process.env.LANGGRAPH_MODEL || 'gpt-4o-mini'

console.log('Testing LLM Configuration:')
console.log('API Key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'NOT SET')
console.log('Base URL:', baseURL || 'NOT SET')
console.log('Model:', model)
console.log('---')

if (!apiKey) {
  console.error('❌ LLM_API_KEY not configured')
  process.exit(1)
}

const llm = new ChatOpenAI({
  apiKey,
  model,
  temperature: 0.3,
  maxTokens: 500,
  configuration: baseURL ? { baseURL } : undefined
})

console.log('Sending test request to LLM...')

try {
  const startTime = Date.now()
  const response = await llm.invoke([
    new SystemMessage('你是一个测试助手。'),
    new HumanMessage('你好，请简单回复一句话。')
  ])
  const duration = Date.now() - startTime

  console.log('✅ LLM Response received in', duration, 'ms')
  console.log('Response:', response.content)
  console.log('---')
  console.log('✅ LLM API is working correctly')
} catch (error) {
  console.error('❌ LLM API Error:')
  console.error(error.message)
  if (error.response) {
    console.error('Response status:', error.response.status)
    console.error('Response data:', error.response.data)
  }
  process.exit(1)
}
