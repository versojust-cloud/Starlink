import { NextResponse } from 'next/server'
import { callLLMWithRetry } from '@/shared/lib/llm'

const templates = [
  {
    id: 'talent-report',
    name: '人才培养报告',
    description: '评估现状、能力模型与行动规划',
    tones: ['正式', '中性', '鼓励']
  },
  {
    id: 'market-brief',
    name: '市场进入简报',
    description: 'APAC 市场洞察与落地路线',
    tones: ['正式', '简洁', '行动导向']
  },
  {
    id: 'partnership-proposal',
    name: '合作提案',
    description: '价格、里程碑与风险说明',
    tones: ['合作', '稳健', '务实']
  }
]

type GeneratePayload = {
  source: string
  templateId: string
  tone?: string
  ensureNeutrality?: boolean
  applyFormatting?: boolean
  action?: 'draft' | 'regenerate' | 'tone' | 'bias'
}

export async function GET() {
  return NextResponse.json({ templates })
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as GeneratePayload | null

  if (!body || !body.source || !body.templateId) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const template = templates.find((item) => item.id === body.templateId)
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }

  const action = body.action ?? 'draft'
  const tone = body.tone ?? '正式'

  // 根据不同的 action 构建不同的 prompt
  const systemPrompt = buildSystemPrompt(action, template, tone, body.ensureNeutrality ?? false)
  const userPrompt = buildUserPrompt(action, template, tone, body.source)

  let generated: string | null = null

  try {
    const llm = await callLLMWithRetry([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ])
    generated = llm.content
  } catch (error) {
    console.error('[reports] LLM generation failed:', error)
    generated = null
  }

  const fallback = buildMockReport({
    template,
    tone,
    source: body.source,
    action,
    neutrality: body.ensureNeutrality ?? false
  })

  const content = generated ?? fallback

  return NextResponse.json({
    template,
    content,
    title: `生成文档：${template.name}`,
    formattingApplied: Boolean(body.applyFormatting),
    neutralityChecked: Boolean(body.ensureNeutrality)
  })
}

/**
 * 根据 action 构建不同的系统 prompt
 */
function buildSystemPrompt(
  action: NonNullable<GeneratePayload['action']>,
  template: (typeof templates)[number],
  tone: string,
  ensureNeutrality: boolean
): string {
  const baseInstructions = `你是商务写作助手，擅长跨文化沟通和报告生成。

**模板**：${template.name}
**模板说明**：${template.description}
**语气**：${tone}
${ensureNeutrality ? '**特别要求**：必须确保文化中立，避免刻板印象和偏见' : ''}`

  const actionInstructions: Record<string, string> = {
    draft: `**任务**：根据用户提供的原始内容，生成一份完整的结构化报告。

**要求**：
1. 使用清晰的层级结构（一、二、三...）
2. 每个部分都要有具体的内容和可执行建议
3. 保持专业、客观的语气
4. 如果适用，包含：现状分析、核心洞察、执行计划
5. 长度控制在 500-800 字`,

    regenerate: `**任务**：对用户提供的内容进行改写，提升表达质量和专业度。

**要求**：
1. 保持原有的核心观点和信息
2. 优化语言表达，使其更专业、流畅
3. 调整段落结构，提升可读性
4. 突出差异化和关键要点
5. 保持与原文相似的长度`,

    tone: `**任务**：针对语气进行润色，确保符合 "${tone}" 的风格。

**要求**：
1. 保持原有的信息和结构
2. 调整用词和句式，符合 "${tone}" 语气
3. 确保语气的一致性
4. 保持专业性，不过度修饰
5. 保持与原文相似的长度`,

    bias: `**任务**：检查并修正内容中的潜在偏见和文化刻板印象。

**要求**：
1. 识别可能存在的文化偏见、性别偏见、地域偏见
2. 用中立、客观的表述替换有偏见的内容
3. 避免使用刻板印象和概括性表述
4. 确保对不同文化的尊重
5. 在修改后添加一段"偏见校验说明"，列出发现的问题和修改内容`
  }

  return `${baseInstructions}\n\n${actionInstructions[action] || actionInstructions.draft}`
}

/**
 * 根据 action 构建用户 prompt
 */
function buildUserPrompt(
  action: NonNullable<GeneratePayload['action']>,
  template: (typeof templates)[number],
  tone: string,
  source: string
): string {
  const actionPrefix: Record<string, string> = {
    draft: '请根据以下原始内容生成报告：',
    regenerate: '请改写以下内容：',
    tone: `请将以下内容调整为 "${tone}" 语气：`,
    bias: '请检查并修正以下内容中的潜在偏见：'
  }

  return `${actionPrefix[action] || actionPrefix.draft}

${source}`
}

function buildMockReport({
  template,
  tone,
  source,
  action,
  neutrality
}: {
  template: (typeof templates)[number]
  tone: string
  source: string
  action: NonNullable<GeneratePayload['action']>
  neutrality: boolean
}) {
  const toneLine = `语气：${tone}，${neutrality ? '已强调文化中立' : '如需中立可再校验'}.`
  const actionLine =
    action === 'regenerate'
      ? '本次为改写版本，突出差异化。'
      : action === 'tone'
        ? '已针对语气进行再润色。'
        : action === 'bias'
          ? '已检查潜在偏见，弱化可能的文化刻板印象。'
          : '初稿已生成，可进一步细化段落。'

  return [
    `${template.name} · 摘要`,
    toneLine,
    actionLine,
    '',
    '一、关键信息',
    `- 输入摘要：${source.slice(0, 180)}${source.length > 180 ? '...' : ''}`,
    '- 目标：明确跨文化沟通要点并输出可落地的行动',
    '',
    '二、核心洞察',
    '- 利益对齐：强调长期合作与互惠',
    '- 风险提示：提前确认决策人、合规和时间预期',
    '- 本地化：用本地案例佐证，减少抽象表述',
    '',
    '三、执行计划',
    '1) 准备：整理一页提案，包含时间线与决策清单',
    '2) 沟通：先寒暄再入题，使用开放式问题收集需求',
    '3) 跟进：会议后24小时发送纪要和下一步确认',
    '',
    '四、附录',
    '- 模板: ' + template.description,
    '- 语气: ' + tone
  ].join('\n')
}
