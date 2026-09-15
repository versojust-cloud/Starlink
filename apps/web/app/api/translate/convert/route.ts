'use server'

import { NextResponse } from 'next/server'
import { callLLMWithRetry } from '@/shared/lib/llm'

type ConversionMode = 'simplified-traditional' | 'traditional-simplified'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      text,
      mode = 'simplified-traditional'
    } = body

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ message: '请提供需要转换的文本。' }, { status: 400 })
    }

    // 繁简转换使用 LLM
    const systemPrompt = buildConversionPrompt(mode as ConversionMode)
    const userPrompt = text.trim()

    let translation: string | null = null

    try {
      const llm = await callLLMWithRetry([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ])

      translation = llm.content.trim()
    } catch (error) {
      console.error('[translate/convert] LLM generation failed:', error)
      return NextResponse.json(
        { message: 'LLM 转换失败，请检查配置' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      translation,
      mode,
      model: 'LLM'
    })
  } catch (error) {
    console.error('[api/translate/convert] failed', error)
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : '转换失败，请稍后重试。'
      },
      { status: 500 }
    )
  }
}

/**
 * 构建繁简转换 prompt
 */
function buildConversionPrompt(mode: ConversionMode): string {
  const instructions: Record<ConversionMode, { from: string; to: string; rules: string }> = {
    'simplified-traditional': {
      from: '简体中文',
      to: '繁体中文',
      rules: `- 准确转换所有简体字为对应的繁体字
- 注意多音字和异体字的正确使用（如：后/後、干/幹、发/發）
- 保持标点符号和格式不变
- 不改变词汇和语法，只转换文字形式`
    },
    'traditional-simplified': {
      from: '繁体中文',
      to: '简体中文',
      rules: `- 准确转换所有繁体字为对应的简体字
- 注意多字对应关系（如：後→后、幹→干、發→发）
- 保持标点符号和格式不变
- 不改变词汇和语法，只转换文字形式`
    }
  }

  const { from, to, rules } = instructions[mode]

  return `你是专业的中文繁简体转换助手。

**任务**：将${from}文本转换为${to}。

**转换规则**：
${rules}

**重要**：
1. 只进行文字形式转换，不改变用词和表达
2. 只返回转换后的文本，不要有任何解释或说明
3. 保持原文的段落结构和格式
4. 确保转换的准确性，特别注意易混淆的字

**示例**（简→繁）**：
输入：我们需要在本季度完成产品发布
输出：我們需要在本季度完成產品發佈

**示例（繁→简）**：
输入：臺灣的網絡技術發展迅速
输出：台湾的网络技术发展迅速`
}
