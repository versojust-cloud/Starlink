import { NextResponse } from 'next/server'
import { callLLMWithRetry } from '@/shared/lib/llm'
import { randomUUID } from 'node:crypto'

type AnalyzeRequest = {
  tenantId?: string
  userId?: string
  taskId?: string
  question: string
  timeline?: Array<{
    id: string
    type: string
    position: { x: number; y: number }
    data: Record<string, unknown>
  }>
  edges?: Array<{ id: string; source: string; target: string; label?: string | null }>
}

type TimelineNode = {
  id: string
  type: string
  position: { x: number; y: number }
  data: Record<string, unknown>
}

type TimelineEdge = {
  id: string
  source: string
  target: string
  label?: string | null
}

const ROOT_POSITION = { x: 400, y: 100 }
const HORIZONTAL_SPACING = 500  // 水平间距：让两个分支左右分开
const VERTICAL_SPACING = 280    // 垂直间距：层级之间的距离

/**
 * AI 任务拆分的 System Prompt
 */
const SYSTEM_PROMPT = `你是一个专业的任务分析助手，擅长将复杂问题拆解为结构化的执行计划。

你的任务是分析用户提出的问题，然后按照以下结构返回 JSON：

{
  "summary": "对问题的简短总结（2-3句话）",
  "subQuestions": [
    {
      "title": "子问题标题",
      "bullets": ["要点1", "要点2", "要点3"]
    }
  ],
  "dimensions": [
    {
      "title": "分析维度标题",
      "bullets": ["分析要点1", "分析要点2", "分析要点3"]
    }
  ],
  "actionItems": [
    {
      "title": "行动项标题",
      "bullets": ["具体行动1", "具体行动2", "具体行动3"]
    }
  ]
}

要求：
1. summary 要简洁明了，直击问题核心
2. **subQuestions 必须恰好 2 个**，用于澄清问题的最关键方面
3. **dimensions 必须恰好 2 个**，选择最重要的分析角度
4. **actionItems 必须恰好 2 个**，聚焦最优先的执行步骤
5. 每个 bullets 数组包含 2-3 个要点（不要超过3个）
6. **必须返回纯 JSON，不要有任何其他文字**
7. **保持结构简洁，总共生成 5 个节点即可：1个根节点 + 2个子问题 + 2个维度**

示例输入：
"我想做一个 AI Agent 产品"

示例输出：
{
  "summary": "你想开发一个 AI Agent 产品。我们需要先明确目标用户、核心功能和技术路线，然后制定产品规划和开发计划。",
  "subQuestions": [
    {
      "title": "澄清产品定位",
      "bullets": ["目标用户是谁？", "解决什么核心痛点？", "与现有产品的差异是什么？"]
    },
    {
      "title": "确定技术边界",
      "bullets": ["需要哪些 AI 能力？", "技术栈选型如何？", "有哪些限制条件？"]
    }
  ],
  "dimensions": [
    {
      "title": "产品功能与体验",
      "bullets": ["核心功能清单", "用户交互流程", "性能与可靠性要求"]
    },
    {
      "title": "技术架构与实现",
      "bullets": ["前后端架构设计", "LLM 选型与集成方案", "数据存储与安全"]
    }
  ],
  "actionItems": [
    {
      "title": "需求调研与验证",
      "bullets": ["访谈 5-10 个目标用户", "分析竞品功能", "输出产品 PRD"]
    },
    {
      "title": "技术预研与原型",
      "bullets": ["搭建基础框架", "接入 LLM API", "开发核心功能 MVP"]
    }
  ]
}
`

/**
 * POST /api/ai/analyze
 * 使用 LLM 分析问题并生成任务拆分
 */
export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as AnalyzeRequest

    if (!payload?.question?.trim()) {
      return NextResponse.json({ message: 'question is required' }, { status: 400 })
    }

    const question = payload.question.trim()
    const tenantId = payload.tenantId ?? 'default-tenant'

    // 调用 LLM 进行分析
    const llmResponse = await callLLMWithRetry([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: question }
    ])

    // 解析 JSON 响应
    let analysisResult
    try {
      // 尝试提取 JSON（有些模型会在 markdown 代码块里返回）
      const content = llmResponse.content.trim()
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/)
      const jsonString = jsonMatch ? jsonMatch[1] : content
      analysisResult = JSON.parse(jsonString)
    } catch {
      console.error('Failed to parse LLM response:', llmResponse.content)
      return NextResponse.json(
        {
          message: 'Failed to parse LLM response',
          raw: llmResponse.content
        },
        { status: 500 }
      )
    }

    // 构建时间线图
    const graph = buildTimelineGraph({
      question,
      tenantId,
      analysis: analysisResult
    })

    return NextResponse.json({
      nodes: graph.nodes,
      edges: graph.edges,
      summary: analysisResult.summary,
      iteration: {
        id: randomUUID(),
        version: (payload.timeline?.length ?? 0) + 1,
        summary: analysisResult.summary,
        createdAt: new Date().toISOString(),
        nodes: graph.nodes,
        edges: graph.edges
      }
    })
  } catch (error) {
    console.error('[api/ai/analyze] Error:', error)
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    )
  }
}

/**
 * 根据 LLM 分析结果构建时间线图
 */
function buildTimelineGraph({
  question,
  tenantId,
  analysis
}: {
  question: string
  tenantId: string
  analysis: {
    summary: string
    subQuestions: Array<{ title: string; bullets: string[] }>
    dimensions: Array<{ title: string; bullets: string[] }>
    actionItems: Array<{ title: string; bullets: string[] }>
  }
}): { nodes: TimelineNode[]; edges: TimelineEdge[] } {
  const nodes: TimelineNode[] = []
  const edges: TimelineEdge[] = []

  const addNode = (node: TimelineNode, edge?: TimelineEdge) => {
    nodes.push(node)
    if (edge) {
      edges.push(edge)
    }
  }

  // 1. 创建根节点
  const rootId = `root-${tenantId}-${Date.now()}`
  addNode({
    id: rootId,
    type: 'note',
    position: { ...ROOT_POSITION },
    data: {
      type: 'note',
      title: '任务规划',
      subtitle: question,
      content: analysis.summary,
      footerText: '由 AI 生成的任务分析',
      variant: 'primary'
    }
  })

  // 2. 创建子问题分支（澄清阶段）- 只生成2个，方便观察动画
  const subQuestions = analysis.subQuestions.slice(0, 2) // 最多2个
  const branchNodes = subQuestions.map((subQ, index) => {
    const id = `branch-${index}-${Date.now()}`
    // 两个分支左右分开，形成树状结构
    const offsetX = index === 0 ? -HORIZONTAL_SPACING / 2 : HORIZONTAL_SPACING / 2
    const node: TimelineNode = {
      id,
      type: 'note',
      position: {
        x: ROOT_POSITION.x + offsetX,
        y: ROOT_POSITION.y + VERTICAL_SPACING  // 第二层
      },
      data: {
        type: 'note',
        title: `第 ${index + 1} 步 · ${subQ.title}`,
        content: `围绕「${question}」的关键澄清点`,
        bullets: subQ.bullets,
        variant: 'timeline-step'
      }
    }
    addNode(node, {
      id: `${rootId}->${id}`,
      source: rootId,
      target: id,
      label: `步骤 ${index + 1}`
    })
    return node
  })

  // 3. 为每个分支添加分析维度
  branchNodes.forEach((branch, index) => {
    const dimension = analysis.dimensions[index % analysis.dimensions.length]
    const dimensionId = `dimension-${index}-${Date.now()}`
    const dimensionNode: TimelineNode = {
      id: dimensionId,
      type: 'note',
      position: {
        x: branch.position.x,
        y: branch.position.y + VERTICAL_SPACING  // 第三层
      },
      data: {
        type: 'note',
        title: dimension.title,
        content: '从该维度深入分析',
        bullets: dimension.bullets,
        variant: 'timeline-dimension'
      }
    }

    addNode(dimensionNode, {
      id: `${branch.id}->${dimensionId}`,
      source: branch.id,
      target: dimensionId,
      label: '分析维度'
    })

    // 4. 为每个维度添加行动项
    const action = analysis.actionItems[index % analysis.actionItems.length]
    const actionId = `action-${index}-${Date.now()}`
    addNode(
      {
        id: actionId,
        type: 'note',
        position: {
          x: dimensionNode.position.x,
          y: dimensionNode.position.y + VERTICAL_SPACING  // 第四层
        },
        data: {
          type: 'note',
          title: action.title,
          content: '具体执行步骤',
          bullets: action.bullets,
          variant: 'timeline-action'
        }
      },
      {
        id: `${dimensionId}->${actionId}`,
        source: dimensionId,
        target: actionId,
        label: '行动计划'
      }
    )
  })

  return { nodes, edges }
}
