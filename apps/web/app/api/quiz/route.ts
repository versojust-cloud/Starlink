import { NextResponse } from 'next/server'

type QuizQuestion = {
  id: string
  question: string
  options: string[]
  correctAnswer: number
  explanation: string
  difficulty: 'easy' | 'medium' | 'hard'
}

type QuizGenerateRequest = {
  nodeLabel: string
  nodeDomain: string
  nodeContent: string
}

const QUIZ_GENERATION_PROMPT = `你是一位商业教育专家，负责基于 CC-BMC（Canvas Cultural Business Model）业务分析内容生成高质量的互动问答题目。

你的任务：
1. 分析给定的节点内容（包括节点标签、所属维度、详细描述）
2. 生成 3 道多选题，分别对应 easy、medium、hard 三个难度级别
3. 每道题目必须深入理解业务逻辑，而非表面知识

题目要求：
- **Easy 题目**：测试对核心概念的基本理解
- **Medium 题目**：测试对业务逻辑的应用能力
- **Hard 题目**：测试对商业模式的批判性思考和跨维度协同理解

输出格式（纯 JSON，不要有任何其他文字）：
[
  {
    "id": "1",
    "question": "问题描述",
    "options": ["选项A", "选项B", "选项C", "选项D"],
    "correctAnswer": 0,
    "explanation": "详细解释为什么这个答案正确，以及其他选项为什么不正确",
    "difficulty": "easy"
  },
  {
    "id": "2",
    "question": "问题描述",
    "options": ["选项A", "选项B", "选项C", "选项D"],
    "correctAnswer": 1,
    "explanation": "详细解释",
    "difficulty": "medium"
  },
  {
    "id": "3",
    "question": "问题描述",
    "options": ["选项A", "选项B", "选项C", "选项D"],
    "correctAnswer": 2,
    "explanation": "详细解释",
    "difficulty": "hard"
  }
]

注意：
- 问题要具体、有深度，避免宽泛的概念性问题
- 选项要有干扰性，但只有一个明确正确答案
- 解释要教育性强，帮助用户深入理解商业逻辑
- correctAnswer 是索引（0-3）
`

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as QuizGenerateRequest
    const { nodeLabel, nodeDomain, nodeContent } = body

    if (!nodeLabel || !nodeDomain || !nodeContent) {
      return NextResponse.json(
        { error: 'Missing required fields: nodeLabel, nodeDomain, nodeContent' },
        { status: 400 }
      )
    }

    // 获取 LLM 配置
    const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || ''
    const baseURL = process.env.LLM_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
    const model = process.env.LLM_MODEL || 'gpt-4o-mini'

    if (!apiKey) {
      // 如果没有配置 LLM，返回 Mock 数据
      console.warn('[Quiz API] LLM not configured, returning mock data')
      return NextResponse.json(getMockQuizData(nodeLabel, nodeDomain))
    }

    // 构建提示词
    const userPrompt = `请基于以下 CC-BMC 节点信息生成 3 道 Quiz 题目：

**节点标签**: ${nodeLabel}
**所属维度**: ${nodeDomain}
**节点内容**:
${nodeContent}

请按照要求生成 3 道题目（easy, medium, hard），返回纯 JSON 格式。`

    // 调用 LLM API
    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: QUIZ_GENERATION_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.8,
        response_format: { type: 'json_object' }
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Quiz API] LLM error:', response.status, errorText)
      return NextResponse.json(
        { error: `LLM API error: ${response.status}` },
        { status: 500 }
      )
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      console.error('[Quiz API] Empty response from LLM')
      return NextResponse.json(getMockQuizData(nodeLabel, nodeDomain))
    }

    // 解析 JSON 响应
    let questions: QuizQuestion[]
    try {
      const parsed = JSON.parse(content)
      // 处理可能的响应格式差异
      questions = Array.isArray(parsed) ? parsed : parsed.questions || []

      // 验证数据格式
      if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error('Invalid questions format')
      }

      // 确保每个问题都有必需的字段
      questions = questions.map((q, idx) => ({
        id: q.id || `${idx + 1}`,
        question: q.question || '',
        options: Array.isArray(q.options) ? q.options : [],
        correctAnswer: typeof q.correctAnswer === 'number' ? q.correctAnswer : 0,
        explanation: q.explanation || '',
        difficulty: q.difficulty || (idx === 0 ? 'easy' : idx === 1 ? 'medium' : 'hard')
      }))

    } catch (parseError) {
      console.error('[Quiz API] Failed to parse LLM response:', parseError)
      return NextResponse.json(getMockQuizData(nodeLabel, nodeDomain))
    }

    return NextResponse.json(questions)

  } catch (error) {
    console.error('[Quiz API] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Mock 数据作为降级方案
function getMockQuizData(nodeLabel: string, nodeDomain: string): QuizQuestion[] {
  return [
    {
      id: '1',
      question: `关于 ${nodeDomain} 维度，以下哪个描述最符合 ${nodeLabel} 的核心价值？`,
      options: [
        '通过降低成本提升竞争力',
        '通过创新服务增强客户粘性',
        '通过规模化运营提高效率',
        '通过差异化定位占领市场'
      ],
      correctAnswer: 1,
      explanation: `基于 ${nodeLabel} 的内容分析，该方案的核心在于通过创新服务来增强客户粘性，这与 ${nodeDomain} 的战略定位高度一致。`,
      difficulty: 'medium'
    },
    {
      id: '2',
      question: `在 ${nodeDomain} 的实施过程中，最关键的风险因素是什么？`,
      options: [
        '市场需求不确定性',
        '技术实现复杂度',
        '资源投入不足',
        '竞争对手模仿'
      ],
      correctAnswer: 0,
      explanation: '市场需求的不确定性是该维度最需要关注的风险因素，需要通过持续的市场验证和快速迭代来降低风险。',
      difficulty: 'hard'
    },
    {
      id: '3',
      question: `${nodeLabel} 与哪个 CC-BMC 维度的协同效应最强？`,
      options: [
        '价值主张 (Value Propositions)',
        '客户细分 (Customer Segments)',
        '关键资源 (Key Resources)',
        '成本结构 (Cost Structure)'
      ],
      correctAnswer: 0,
      explanation: '价值主张与该要素之间存在强协同关系，两者相互支撑构成商业模式的核心逻辑。',
      difficulty: 'easy'
    }
  ]
}
