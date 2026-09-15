'use server'

import { NextResponse } from 'next/server'
import { callLLMWithRetry } from '@/shared/lib/llm'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      text,
      sourceLanguage,
      targetLanguage,
      mode = 'standard'
    } = body

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ message: '请提供需要翻译的文本。' }, { status: 400 })
    }

    if (!targetLanguage) {
      return NextResponse.json({ message: '请指定目标语言。' }, { status: 400 })
    }

    // 构建翻译 prompt
    const systemPrompt = buildTranslatePrompt(mode, sourceLanguage, targetLanguage)
    const userPrompt = text.trim()

    let translation: string | null = null

    try {
      const llm = await callLLMWithRetry([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ])

      translation = llm.content.trim()
    } catch (error) {
      console.error('[translate] LLM generation failed:', error)
      return NextResponse.json(
        { message: 'LLM 翻译失败，请检查配置' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      translation,
      detectedSourceLanguage: sourceLanguage || 'auto',
      model: 'LLM',
      latencyMs: 0
    })
  } catch (error) {
    console.error('[api/translate] failed', error)
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : '翻译失败，请稍后重试。'
      },
      { status: 500 }
    )
  }
}

/**
 * 根据翻译模式构建 prompt
 */
function buildTranslatePrompt(
  mode: string,
  sourceLanguage: string | undefined,
  targetLanguage: string
): string {
  const languageNames: Record<string, string> = {
    'en': '英文',
    'zh-CN': '中文（简体）',
    'zh-TW': '中文（繁体）',
    'ja': '日语',
    'ko': '韩语',
    'es': '西班牙语',
    'fr': '法语',
    'de': '德语'
  }

  const targetLangName = languageNames[targetLanguage] || targetLanguage
  const sourceLangHint = sourceLanguage && sourceLanguage !== 'auto'
    ? `源语言是${languageNames[sourceLanguage] || sourceLanguage}。`
    : ''

  const modeInstructions: Record<string, string> = {
    standard: `提供准确、流畅、自然的翻译`,
    formal: `使用正式、专业的语气，适合商务和学术场景。避免口语化表达`,
    casual: `使用轻松、口语化的表达，适合日常对话和社交媒体。可以使用网络用语和简化表达`,
    professional: `保留专业术语和行业术语的原文或标准译名，确保术语准确性`
  }

  return `你是专业的翻译助手。

**任务**：将用户提供的文本翻译成${targetLangName}。${sourceLangHint}

**翻译要求**：
- 风格：${modeInstructions[mode] || modeInstructions.standard}
- 保持原文的含义、语气和风格
- 确保翻译准确、自然、流畅
- 不要添加任何解释或说明，只返回翻译后的文本
- 如果原文包含多个段落，保持段落结构

**重要**：只返回翻译结果，不要有任何其他文字。`
}
