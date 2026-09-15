'use server'

import { NextResponse } from 'next/server'
import { callLLMWithRetry } from '@/shared/lib/llm'

export async function GET() {
  return NextResponse.json({
    message: 'Use POST with JSON to call this endpoint.',
    examples: [
      'curl -X POST http://localhost:3000/api/deep-research -H "Content-Type: application/json" -d \'{"query":"人工智能的发展历史","researchType":"comprehensive"}\''
    ]
  })
}

type ResearchResult = {
  summary: string
  keyPoints: string[]
  sources: string[]
  detailedAnalysis: string
  recommendations?: string[]
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      query,
      researchType = 'comprehensive',
      depth = 'medium',
      sources = [],
      language = 'zh'
    } = body

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json({ message: '请提供研究主题或问题。' }, { status: 400 })
    }

    // 构建 LLM prompt
    const systemPrompt = buildSystemPrompt(researchType, depth, sources, language)
    const userPrompt = query.trim()

    let generated: ResearchResult | null = null

    try {
      const llm = await callLLMWithRetry([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ])

      // 尝试解析 JSON 响应
      const cleaned = llm.content.replace(/```json\n?|\n?```/g, '').trim()
      try {
        generated = JSON.parse(cleaned) as ResearchResult
      } catch {
        // 如果不是 JSON，尝试从文本中解析
        generated = parseResearchText(llm.content)
      }
    } catch (error) {
      console.error('[deep-research] LLM generation failed:', error)
      generated = null
    }

    // Fallback to mock data
    if (!generated) {
      generated = buildMockResearch(query)
    }

    return NextResponse.json({
      result: generated,
      usage: { total_tokens: 0 }
    })
  } catch (error) {
    console.error('[api/deep-research] failed', error)
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : '深度研究失败，请稍后重试。'
      },
      { status: 500 }
    )
  }
}

/**
 * 根据研究类型构建系统 prompt
 */
function buildSystemPrompt(
  researchType: string,
  depth: string,
  sources: string[],
  language: string
): string {
  const depthInstructions: Record<string, string> = {
    shallow: '提供简明扼要的概述，重点突出核心信息',
    medium: '提供中等深度的分析，包含关键发现和详细说明',
    deep: '提供深入全面的分析，包含多角度洞察和详尽论证'
  }

  const typeInstructions: Record<string, string> = {
    comprehensive: '全面综合分析',
    academic: '学术研究视角，引用权威文献',
    market: '市场分析视角，关注商业洞察和趋势',
    technical: '技术分析视角，深入技术细节'
  }

  return `你是专业的研究分析助手，擅长深度调研和结构化分析。

**研究要求**：
- 类型：${typeInstructions[researchType] || typeInstructions.comprehensive}
- 深度：${depthInstructions[depth] || depthInstructions.medium}
- 语言：${language === 'zh' ? '中文' : language}
${sources.length > 0 ? `- 重点信息源：${sources.join(', ')}` : ''}

**输出格式**：
请以 JSON 格式返回研究结果，结构如下：
{
  "summary": "研究概览（200-300字的总结）",
  "keyPoints": [
    "关键发现1（具体、有数据支撑）",
    "关键发现2",
    "关键发现3"
  ],
  "detailedAnalysis": "详细分析（结构化的深入分析，使用 ## 标题分段）",
  "sources": [
    "Nature Medicine - AI in Medical Imaging (https://www.nature.com/nm/)",
    "McKinsey Report 2023 (https://www.mckinsey.com/industries/healthcare)",
    "Google Scholar - AI Healthcare Research (https://scholar.google.com/)"
  ],
  "recommendations": [
    "建议1（可执行的具体建议）",
    "建议2",
    "建议3"
  ]
}

**要求**：
1. summary 要简洁有力，直击核心
2. keyPoints 至少 3 条，每条都要有实质性内容
3. detailedAnalysis 使用 ## 分段，结构清晰
4. sources 必须包含具体的 URL 链接（格式：资源名称 (URL)），尽量提供真实可访问的链接
5. recommendations 要具体可执行
6. 必须返回有效的 JSON 格式，不要有其他文字`
}

/**
 * 从文本中解析研究结果
 */
function parseResearchText(text: string): ResearchResult {
  const summaryMatch = text.match(
    /(?:总结|概览|概述)[:：]\s*([\s\S]*?)(?=\n\n|\n[一二三四五六七八九十]|\n\d+\.|\n#|$)/i
  )
  const summary = summaryMatch?.[1]?.trim() || text.slice(0, 200) + '...'

  const keyPoints: string[] = []
  const keyPointsMatch = text.match(
    /(?:关键点|要点|重要发现)[:：]([\s\S]*?)(?=\n\n|\n[一二三四五六七八九十]|\n\d+\.|\n#|$)/i
  )
  if (keyPointsMatch) {
    const points = keyPointsMatch[1].split(/[\n\d\.•、]/).filter((p) => p.trim().length > 0)
    keyPoints.push(...points.map((p) => p.trim()))
  }

  const sources: string[] = []
  const sourcesMatch = text.match(
    /(?:信息源|参考资料|引用来源)[:：]([\s\S]*?)(?=\n\n|\n[一二三四五六七八九十]|\n\d+\.|\n#|$)/i
  )
  if (sourcesMatch) {
    const src = sourcesMatch[1].split(/[\n\d\.•、]/).filter((s) => s.trim().length > 0)
    sources.push(...src.map((s) => s.trim()))
  }

  const recommendations: string[] = []
  const recommendationsMatch = text.match(
    /(?:建议|推荐|下一步)[:：]([\s\S]*?)(?=\n\n|\n[一二三四五六七八九十]|\n\d+\.|\n#|$)/i
  )
  if (recommendationsMatch) {
    const recs = recommendationsMatch[1]
      .split(/[\n\d\.•、]/)
      .filter((r) => r.trim().length > 0)
    recommendations.push(...recs.map((r) => r.trim()))
  }

  return {
    summary,
    keyPoints,
    sources,
    detailedAnalysis: text,
    recommendations: recommendations.length > 0 ? recommendations : undefined
  }
}

/**
 * 构建 mock 研究结果
 */
function buildMockResearch(query: string): ResearchResult {
  return {
    summary: `针对「${query}」的深度研究分析（LLM 调用失败，显示示例数据）`,
    keyPoints: [
      '这是示例关键发现 1 - LLM 未正确配置',
      '这是示例关键发现 2 - 请检查环境变量配置',
      '这是示例关键发现 3 - 配置后将显示真实研究结果'
    ],
    detailedAnalysis: `## 示例分析

这是 LLM 未配置时的示例内容。

## 配置说明

请在 .env.local 中配置：
- LLM_PROVIDER
- LLM_API_KEY
- LLM_BASE_URL
- LLM_MODEL

## 下一步

配置完成后重新提交研究请求。`,
    sources: [
      '示例信息源 1（学术文献）',
      '示例信息源 2（行业报告）',
      '示例信息源 3（新闻资讯）'
    ],
    recommendations: [
      '配置 LLM API 密钥',
      '重新提交研究请求',
      '查看生成的真实研究报告'
    ]
  }
}
