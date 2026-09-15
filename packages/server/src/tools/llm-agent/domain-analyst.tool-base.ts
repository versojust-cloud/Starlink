import { BaseTool } from '@starlink/shared'
import type { ToolDefinition, ToolContext, ToolMessage } from '@starlink/shared'
import { LLMClient } from '../../services/llm-client.js'
import { parseBmcAnalysisOutput } from './bmc-output.js'

type DomainAnalystConfig = {
  toolName: string
  label: string
  description: string
  color: string
  roleName: string
  roleTitle: string
  domains: string[]
  questionDescription: string
  evidenceEnabled?: boolean
}

export class DomainAnalystTool extends BaseTool {
  readonly definition: ToolDefinition
  private readonly systemPrompt: string

  constructor(private readonly config: DomainAnalystConfig) {
    super()
    this.definition = buildDefinition(config)
    this.systemPrompt = buildSystemPrompt(config)
  }

  async *execute(
    input: Record<string, unknown>,
    _context: ToolContext
  ): AsyncGenerator<ToolMessage> {
    const question = input.question as string
    const ctx = input.context as string | undefined
    const evidence = input.evidence as string[] | undefined

    let userContent = question
    if (ctx) userContent += `\n\n背景信息：${ctx}`
    if (this.config.evidenceEnabled && evidence && evidence.length > 0) {
      userContent += `\n\n参考证据：\n${evidence.map((e, i) => `${i + 1}. ${e}`).join('\n')}`
    }

    const llm = new LLMClient()
    const response = await llm.chat({
      messages: [
        { role: 'system', content: this.systemPrompt },
        { role: 'user', content: userContent }
      ]
    })

    const { bmcCards } = parseBmcAnalysisOutput(response.content)
    yield { type: 'json', data: { bmcCards } }
  }
}

function buildDefinition(config: DomainAnalystConfig): ToolDefinition {
  const properties: ToolDefinition['inputSchema']['properties'] = {
    question: {
      type: 'string',
      description: config.questionDescription,
      required: true
    },
    context: {
      type: 'string',
      description: '可选的上下文信息'
    }
  }

  const inputPorts: ToolDefinition['inputPorts'] = [
    { name: 'question', type: 'string', description: '用户问题' },
    { name: 'context', type: 'string', description: '上下文信息', required: false }
  ]

  if (config.evidenceEnabled) {
    properties.evidence = {
      type: 'array',
      description: '可选的支撑证据列表'
    }
    inputPorts.push({ name: 'evidence', type: 'array', description: '支撑证据', required: false })
  }

  return {
    identity: {
      name: config.toolName,
      provider: 'builtin',
      version: '1.0.0'
    },
    display: {
      label: config.label,
      description: config.description,
      icon: '🤖',
      category: 'llm_agent',
      color: config.color
    },
    inputSchema: {
      type: 'object',
      properties,
      required: ['question']
    },
    outputSchema: {
      type: 'object',
      properties: {
        bmcCards: {
          type: 'array',
          description: 'BMC 分析卡片数组，每项含 domain, content, confidence'
        }
      }
    },
    inputPorts,
    outputPorts: [
      { name: 'bmcCards', type: 'array', description: 'BMC 分析卡片' }
    ],
    runtime: {
      timeout: 60000,
      retries: 1,
      cacheable: false,
      streamable: true,
      parallel: true
    }
  }
}

function buildSystemPrompt(config: DomainAnalystConfig) {
  const domains = config.domains.join('、')
  return [
    `你是 ${config.roleName}（${config.roleTitle}），负责分析 CC-BMC 商业模型画布中的 ${config.domains.length} 个维度：${domains}。`,
    '\n\n输出格式（必须严格遵守）：\n',
    'JSON 对象 `{ "bmcCards": [...] }`，每个 card 包含：\n',
    '- `domain`：必须是 ', domains, ' 之一\n',
    '- `summary`：**一句话核心结论**（≤60 字），用作画布卡片标题与抽屉摘要。这是用户首先看到的内容，必须具体、有判断（不要"做客户分析"这种空话）。\n',
    '- `content`：**详细分析**（3-6 段或要点列表），200-600 字。结构建议：\n',
    '  1) 拆解：列出该维度下的关键子项（如客户细分→列具体目标客群）\n',
    '  2) 论据：为什么是这些子项 / 数据 / 案例\n',
    '  3) 假设与风险：哪些是确定的，哪些需要验证\n',
    '  4) 行动建议：用户下一步应该做什么\n',
    '  支持 markdown：列表 / 加粗 / 链接 / `[[ref:docId#snippetId]]` 引用 KB 证据\n',
    '- `confidence`：0-1 置信度（基于证据强度）\n',
    '\n关键约束：\n',
    '- summary 和 content **不能相同** — summary 是结论，content 是论证过程。\n',
    '- 如果你只能写出 1-2 句话，那就只填 summary，content 填 ""（空字符串），不要把 summary 复制进 content 凑长度。\n',
    '- 若画布上已有同维度卡片（背景信息中会列出），新输出必须**扩展或反驳**它，不能简单复述。'
  ].join('')
}

