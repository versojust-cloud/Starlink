/**
 * LLM 调用工具类
 * 支持多个 LLM Provider：OpenAI, Anthropic, DeepSeek, Custom
 */

type LLMProvider = 'openai' | 'anthropic' | 'deepseek' | 'custom'

type LLMConfig = {
  provider: LLMProvider
  apiKey: string
  baseURL: string
  model: string
}

type Message = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type LLMResponse = {
  content: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

/**
 * 获取 LLM 配置
 */
export function getLLMConfig(): LLMConfig {
  const provider = (process.env.LLM_PROVIDER || 'openai') as LLMProvider
  const apiKey = process.env.LLM_API_KEY || ''
  const baseURL = process.env.LLM_BASE_URL || 'https://api.openai.com/v1'
  const model = process.env.LLM_MODEL || 'gpt-4o-mini'

  if (!apiKey) {
    throw new Error('LLM_API_KEY is not configured')
  }

  return { provider, apiKey, baseURL, model }
}

/**
 * 调用 OpenAI 兼容的 API
 */
async function callOpenAICompatible(
  config: LLMConfig,
  messages: Message[]
): Promise<LLMResponse> {
  const response = await fetch(`${config.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.7
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`LLM API error: ${response.status} - ${error}`)
  }

  const data = await response.json()

  return {
    content: data.choices[0].message.content,
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0
    }
  }
}

/**
 * 调用 Anthropic Claude API
 */
async function callAnthropic(
  config: LLMConfig,
  messages: Message[]
): Promise<LLMResponse> {
  // 提取 system message
  const systemMessage = messages.find((m) => m.role === 'system')
  const userMessages = messages.filter((m) => m.role !== 'system')

  const response = await fetch(`${config.baseURL}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      system: systemMessage?.content,
      messages: userMessages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      }))
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Anthropic API error: ${response.status} - ${error}`)
  }

  const data = await response.json()

  return {
    content: data.content[0].text,
    usage: {
      promptTokens: data.usage?.input_tokens || 0,
      completionTokens: data.usage?.output_tokens || 0,
      totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
    }
  }
}

/**
 * 统一的 LLM 调用接口
 */
export async function callLLM(messages: Message[]): Promise<LLMResponse> {
  const config = getLLMConfig()

  switch (config.provider) {
    case 'openai':
    case 'deepseek':
    case 'custom':
      return callOpenAICompatible(config, messages)

    case 'anthropic':
      return callAnthropic(config, messages)

    default:
      throw new Error(`Unsupported LLM provider: ${config.provider}`)
  }
}

/**
 * 带重试的 LLM 调用
 */
export async function callLLMWithRetry(
  messages: Message[],
  maxRetries = 3
): Promise<LLMResponse> {
  let lastError: Error | null = null

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await callLLM(messages)
    } catch (error) {
      lastError = error as Error
      console.error(`LLM call failed (attempt ${i + 1}/${maxRetries}):`, error)

      // 如果是最后一次重试，直接抛出错误
      if (i === maxRetries - 1) break

      // 等待后重试（指数退避）
      await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, i)))
    }
  }

  throw lastError || new Error('LLM call failed after retries')
}
