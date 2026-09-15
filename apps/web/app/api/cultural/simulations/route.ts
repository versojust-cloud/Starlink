import { NextResponse } from 'next/server'
import { callLLMWithRetry } from '@/shared/lib/llm'

type SimulationMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
}

const scenarios = [
  {
    id: 'cn-negotiation',
    title: '与中国合作伙伴谈判',
    category: '谈判',
    description: '兼顾礼节与价格博弈，建立信任并争取最佳条款。',
    goal: '平衡价格与长期合作关系，避免失礼',
    level: '中级',
    samplePrompts: ['开场问候', '试探价格', '确认交付周期']
  },
  {
    id: 'kr-presentation',
    title: '韩国客户技术演示',
    category: '演示',
    description: '结构化讲解产品价值，处理尖锐的现场提问。',
    goal: '突出差异化与本地化支持',
    level: '中高级',
    samplePrompts: ['价值主张', '案例分享', '问答处理']
  },
  {
    id: 'us-support',
    title: '处理美国客户升级投诉',
    category: '客服',
    description: '高压情境下保持同理心并提供可执行补救方案。',
    goal: '降级情绪并锁定解决方案',
    level: '初中级',
    samplePrompts: ['致歉与确认', '补偿方案', '后续跟进']
  }
]

const quickReplyPool = [
  '确认对方优先关注点',
  '提出联合路线图',
  '询问预算框架',
  '重申交付里程碑',
  '探讨长期合作折扣'
]

export async function GET() {
  return NextResponse.json({ scenarios })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body.scenarioId !== 'string' || typeof body.message !== 'string') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const scenario = scenarios.find((item) => item.id === body.scenarioId)
  if (!scenario) {
    return NextResponse.json({ error: 'Scenario not found' }, { status: 404 })
  }

  const history: SimulationMessage[] = Array.isArray(body.history) ? body.history : []

  // 使用结构化 prompt 让 LLM 返回 JSON
  const systemPrompt = `你是跨文化沟通教练，帮助用户在 ${scenario.title} 情境中进行有效沟通。

**情境背景**：
- 类别：${scenario.category}
- 描述：${scenario.description}
- 目标：${scenario.goal}
- 难度：${scenario.level}

**你的任务**：
根据用户的输入，生成一个包含以下内容的 JSON 响应：
{
  "reply": "你作为对方角色的回应（模拟真实对话，保持自然和真实性）",
  "feedback": "对用户这轮回复的简短评价（1句话，例如：'Good start!' 或 'Consider being more specific'）",
  "insights": [
    { "title": "文化礼节", "detail": "针对此轮对话的具体礼节建议" },
    { "title": "策略建议", "detail": "针对此轮对话的策略优化建议" },
    { "title": "风险提示", "detail": "可能的风险点和注意事项" }
  ],
  "quickReplies": ["建议回复1", "建议回复2", "建议回复3", "建议回复4"]
}

**要求**：
1. reply 要模拟对方的真实回应，符合其文化背景和沟通风格
2. feedback 要简洁、具体、建设性（不超过15个字）
3. insights 要针对当前对话内容，提供具体、可执行的建议
4. quickReplies 要基于对话上下文，提供 4 个合适的后续回复选项
5. 必须返回有效的 JSON 格式，不要有其他文字`

  let llmResult: {
    reply: string
    feedback?: string
    insights: Array<{ title: string; detail: string }>
    quickReplies: string[]
  } | null = null

  try {
    const llm = await callLLMWithRetry([
      {
        role: 'system',
        content: systemPrompt
      },
      ...history.map((item) => ({ role: item.role, content: item.content })),
      { role: 'user', content: body.message }
    ])

    // 尝试解析 LLM 返回的 JSON
    const cleaned = llm.content.replace(/```json\n?|\n?```/g, '').trim()
    llmResult = JSON.parse(cleaned)
  } catch (error) {
    console.error('[simulations] LLM JSON parse failed:', error)
    llmResult = null
  }

  // Fallback 到 mock 数据
  if (!llmResult) {
    const mockReply = buildMockReply({ scenario, message: body.message, history })
    llmResult = {
      reply: mockReply,
      feedback: 'Good negotiation tactic!',
      insights: [
        {
          title: '文化礼节',
          detail: '先寒暄再入题，表达对长期合作的重视，体现建立关系的意愿。'
        },
        {
          title: '策略建议',
          detail: '用"长期合作折扣""分阶段交付"取代单次压价，降低对方警惕。'
        },
        {
          title: '风险提示',
          detail: '避免在初次接触就施压，可能导致关系破裂。'
        }
      ],
      quickReplies: shuffleArray(quickReplyPool).slice(0, 4)
    }
  }

  // 动态生成参考资料（基于场景）
  const resources = generateResources(scenario)

  return NextResponse.json({
    scenario,
    reply: llmResult.reply,
    feedback: llmResult.feedback,
    insights: llmResult.insights,
    resources,
    quickReplies: llmResult.quickReplies
  })
}

function buildMockReply({
  scenario,
  message,
  history
}: {
  scenario: (typeof scenarios)[number]
  message: string
  history: SimulationMessage[]
}) {
  const lastAssistant = [...history].reverse().find((item) => item.role === 'assistant')
  const opener = lastAssistant
    ? '我注意到上一轮我们提到了合作节奏。'
    : `好的，我们处于「${scenario.title}」情境。`
  return `${opener} 你的最新表述是：“${message}”。建议先确认对方决策链路，再给出2-3个选项（价格区间、交付节点），并邀请对方补充关注点。`
}

function generateResources(scenario: (typeof scenarios)[number]) {
  // 根据场景类别返回相关资源
  const resourceMap: Record<string, Array<{ title: string; url?: string }>> = {
    谈判: [
      { title: '跨文化谈判技巧指南', url: 'https://hbr.org/topic/cross-cultural-management' },
      { title: '谈判 BATNA 方法论', url: 'https://www.pon.harvard.edu/daily/batna/batna-basics-boost-your-power-at-the-bargaining-table/' }
    ],
    演示: [
      { title: '亚太市场演示技巧', url: 'https://www.forbes.com/business-presentations/' },
      { title: '技术演示最佳实践', url: 'https://www.techrepublic.com/article/technical-presentations/' }
    ],
    客服: [
      { title: '客户投诉处理指南', url: 'https://www.zendesk.com/blog/customer-complaint-management/' },
      { title: '同理心沟通技巧', url: 'https://www.helpscout.com/helpu/empathy-in-customer-service/' }
    ]
  }

  return resourceMap[scenario.category] || [
    { title: '跨文化沟通基础', url: 'https://www.mindtools.com/pages/article/cross-cultural-communication.htm' }
  ]
}

function shuffleArray<T>(arr: T[]) {
  const cloned = [...arr]
  for (let i = cloned.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[cloned[i], cloned[j]] = [cloned[j], cloned[i]]
  }
  return cloned
}
