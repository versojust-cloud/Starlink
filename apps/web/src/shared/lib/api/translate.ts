export type TranslatePayload = {
  text: string
  targetLanguage: string
  sourceLanguage?: string
}

export type TranslateResponse = {
  translation: string
  detectedSourceLanguage?: string
  latencyMs?: number
  model?: string
}

export async function translateText(payload: TranslatePayload, options?: { signal?: AbortSignal }) {
  const response = await fetch('/api/translate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    signal: options?.signal
  })

  if (!response.ok) {
    const message = await safeParseError(response)
    throw new Error(message ?? '翻译接口返回异常')
  }

  const data = (await response.json()) as Partial<TranslateResponse>

  return {
    translation: data.translation ?? '',
    detectedSourceLanguage: data.detectedSourceLanguage,
    latencyMs: data.latencyMs,
    model: data.model
  }
}

async function safeParseError(response: Response) {
  try {
    const body = await response.json()
    if (body?.error) return body.error
    if (body?.message) return body.message
  } catch (error) {
    console.error('translateText error body parse failed', error)
  }
  return response.statusText
}
