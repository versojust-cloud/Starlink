import { NextResponse } from 'next/server'
import { callLLMWithRetry } from '@/shared/lib/llm'
import type { OrchestratorRequest, OrchestratorResponse, MacraNodeData, MacraEdgeData } from '@/types/macra'
import { CC_BMC_DOMAINS, AGENT_TYPES } from '@/types/macra'

/**
 * MACRA Orchestrator System Prompt
 * 中央编排器 - 负责操作画布并生成商业模式节点
 */
const ORCHESTRATOR_SYSTEM_PROMPT = `<system_role>
你是由 MACRA (Multi-Agent Collaborative Reasoning Architecture) 驱动的"智绘·无限商业画布"的中央编排器 (Orchestrator)。
你的核心职责不是陪用户聊天，而是**操作画布 (Manipulate the Canvas)**。
你生存于一个无限拓展的二维数字沙盘中。你的每一次输出都必须是对画布数据的操作（增删改查节点、创建连接）。
</system_role>

<core_philosophy>
1. **画布即世界**：所有信息必须可视化。不要只在对话框里回答，要把答案变成节点 (Node) 放在画布上。
2. **生长即完善**：商业模式是生长出来的。从核心节点开始，层层发散。
3. **结构化思维**：始终遵循 CC-BMC (跨文化商业模式画布) 的九大维度：[客户细分, 客户关系, 渠道通路, 价值主张, 收入来源, 关键业务, 核心资源, 重要合作, 成本结构]。
</core_philosophy>

<capabilities>
你可以调用以下虚拟专家 Agent 的能力（通过思维链模拟）：
- **Market_Agent**: 负责客户、渠道、关系。
- **Product_Agent**: 负责价值主张、关键业务。
- **Finance_Agent**: 负责收入、成本。
- **Compliance_Agent**: 负责合规、法律风险。
</capabilities>

<output_protocol>
你**必须**且**只能**返回符合以下 JSON Schema 的数据结构。严禁返回纯文本。

{
  "thought_process": "简要描述你的调度逻辑，例如：用户想做心脏支架出海，我需要调用 Market_Agent 和 Compliance_Agent 生成初步框架。",
  "canvas_actions": [
    {
      "action": "create_node",
      "data": {
        "id": "unique_id_string",
        "type": "cc-bmc-card" | "insight-note" | "agent-avatar",
        "label": "节点标题",
        "content": "节点详细内容（支持 Markdown）",
        "position": { "x": 100, "y": 200 },
        "domain": "CC-BMC 维度 (如: 渠道通路)",
        "metadata": {
          "source": "数据来源标注",
          "confidence": "high/medium/low",
          "agent_signature": "Expert_Agent_Name"
        }
      }
    },
    {
      "action": "create_edge",
      "data": {
        "source": "source_node_id",
        "target": "target_node_id",
        "label": "关系描述 (如: 强依赖, 资金流向)",
        "type": "default",
        "animated": true
      }
    }
  ]
}
</output_protocol>

<interaction_rules>
1. **种子生成 (Seed Generation)**: 当用户输入一个简短的想法（如"心脏支架卖到中国"）时，不要问问题，直接行动。生成核心节点，并立即发散出至少 3-5 个关键的一级子节点（涵盖 目标客户、核心合规、主要渠道）。

2. **智能补全**: 当用户创建一个空节点时，根据上下文自动填充 3 个建议选项作为子节点。

3. **数据溯源**: 凡是涉及法规、数据的结论，必须在 metadata.source 中注明来源（如"基于 NMPA 2024 新规"）。

4. **智能布局策略 (重要)**:
   - **左侧列** (x: 150): 客户相关维度（客户细分、客户关系、渠道通路）
   - **中间列** (x: 450): 价值相关维度（价值主张、关键业务、核心资源）
   - **右侧列** (x: 750): 财务合作维度（收入来源、成本结构、重要合作）
   - **垂直分层**:
     * y: 100 - 战略层（客户细分、价值主张、重要合作）
     * y: 300 - 运营层（客户关系、关键业务、收入来源）
     * y: 500 - 资源层（渠道通路、核心资源、成本结构）
   - **洞察便签**: 默认放在右侧区域 (x: 850, y: 250-350)
   - 同维度多个节点时，向右或向下偏移50px避免重叠
</interaction_rules>

<九大维度说明>
- 客户细分: 目标用户是谁
- 客户关系: 如何维护客户
- 渠道通路: 如何触达客户
- 价值主张: 提供什么独特价值
- 收入来源: 如何赚钱
- 关键业务: 核心业务活动
- 核心资源: 关键资源
- 重要合作: 关键合作伙伴
- 成本结构: 主要成本
</九大维度说明>

现在，你必须根据用户输入和当前画布状态，返回纯 JSON 格式的 canvas_actions。
`

/**
 * POST /api/macra/orchestrate
 * MACRA 中央编排器 - 生成画布操作指令
 */
export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as OrchestratorRequest

    if (!payload?.user_prompt?.trim()) {
      return NextResponse.json({ message: 'user_prompt is required' }, { status: 400 })
    }

    const userPrompt = payload.user_prompt.trim()
    const mode = payload.mode || 'general'
    const canvasSummary = payload.canvas_summary || { nodes: [], edges: [] }

    // 构建上下文提示
    let contextPrompt = `**用户输入**: ${userPrompt}\n\n`
    contextPrompt += `**生成模式**: ${mode}\n\n`

    if (canvasSummary.nodes.length > 0) {
      contextPrompt += `**当前画布状态**:\n`
      contextPrompt += `- 已有 ${canvasSummary.nodes.length} 个节点\n`
      contextPrompt += `- 已有 ${canvasSummary.edges.length} 条连接\n\n`
      contextPrompt += `现有节点列表:\n`
      canvasSummary.nodes.forEach((node, idx) => {
        contextPrompt += `${idx + 1}. [${node.type}] ${node.label} - ${node.domain || ''}\n`
      })
    } else {
      contextPrompt += `**当前画布**: 空白画布，这是用户的第一个输入（种子生成模式）\n\n`
    }

    contextPrompt += `\n请分析用户意图，生成相应的画布操作。记住：必须返回纯 JSON，不要有任何其他文字。`

    // 调用 LLM
    const llmResponse = await callLLMWithRetry([
      { role: 'system', content: ORCHESTRATOR_SYSTEM_PROMPT },
      { role: 'user', content: contextPrompt }
    ])

    // 解析 JSON 响应
    let orchestratorResult: OrchestratorResponse
    try {
      const content = llmResponse.content.trim()
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/)
      const jsonString = jsonMatch ? jsonMatch[1] : content
      orchestratorResult = JSON.parse(jsonString)
    } catch {
      console.error('Failed to parse Orchestrator LLM response:', llmResponse.content)

      // Fallback: 返回模拟数据
      orchestratorResult = generateFallbackResponse(userPrompt, mode)
    }

    // 验证并修正 ID
    orchestratorResult.canvas_actions = orchestratorResult.canvas_actions.map(action => {
      if (action.action === 'create_node') {
        const nodeData = action.data as MacraNodeData
        if (!nodeData.id || nodeData.id === 'unique_id_string') {
          nodeData.id = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        }
      }
      return action
    })

    return NextResponse.json(orchestratorResult)
  } catch (error) {
    console.error('[api/macra/orchestrate] Error:', error)
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    )
  }
}

/**
 * 智能布局算法 - 根据CC-BMC维度计算节点位置
 *
 * 布局策略：
 * - 左侧列（x: 100-300）: 客户相关维度（客户细分、客户关系、渠道通路）
 * - 中间列（x: 400-600）: 价值相关维度（价值主张、关键业务、核心资源）
 * - 右侧列（x: 700-900）: 财务合作维度（收入来源、成本结构、重要合作）
 *
 * Y轴分三层：
 * - 上层（y: 100）: 战略层（客户细分、价值主张、重要合作）
 * - 中层（y: 300）: 运营层（客户关系、关键业务、收入来源）
 * - 下层（y: 500）: 资源层（渠道通路、核心资源、成本结构）
 */
function calculatePositionByDomain(domain: string, index: number = 0): { x: number; y: number } {
  // 根据维度映射到画布位置
  const positionMap: Record<string, { x: number; y: number }> = {
    // 左侧 - 客户相关
    [CC_BMC_DOMAINS.CUSTOMER_SEGMENTS]: { x: 150, y: 100 },    // 客户细分（战略层）
    [CC_BMC_DOMAINS.CUSTOMER_RELATIONSHIPS]: { x: 150, y: 300 }, // 客户关系（运营层）
    [CC_BMC_DOMAINS.CHANNELS]: { x: 150, y: 500 },             // 渠道通路（资源层）

    // 中间 - 价值相关
    [CC_BMC_DOMAINS.VALUE_PROPOSITIONS]: { x: 450, y: 100 },   // 价值主张（战略核心）
    [CC_BMC_DOMAINS.KEY_ACTIVITIES]: { x: 450, y: 300 },       // 关键业务（运营层）
    [CC_BMC_DOMAINS.KEY_RESOURCES]: { x: 450, y: 500 },        // 核心资源（资源层）

    // 右侧 - 财务合作
    [CC_BMC_DOMAINS.KEY_PARTNERSHIPS]: { x: 750, y: 100 },     // 重要合作（战略层）
    [CC_BMC_DOMAINS.REVENUE_STREAMS]: { x: 750, y: 300 },      // 收入来源（运营层）
    [CC_BMC_DOMAINS.COST_STRUCTURE]: { x: 750, y: 500 }        // 成本结构（资源层）
  }

  // 获取基础位置
  const basePosition = positionMap[domain] || { x: 450, y: 300 }

  // 添加轻微偏移避免节点重叠（同维度多个节点时）
  const offset = index * 50

  return {
    x: basePosition.x + (offset % 150),
    y: basePosition.y + Math.floor(offset / 150) * 30
  }
}

/**
 * 生成 Fallback 响应（当 LLM 失败时）
 */
function generateFallbackResponse(userPrompt: string, mode: string): OrchestratorResponse {
  const timestamp = Date.now()

  if (mode === 'seed') {
    // 种子生成模式：创建核心节点 + 关键子节点，使用智能布局
    const corePosition = calculatePositionByDomain(CC_BMC_DOMAINS.VALUE_PROPOSITIONS)
    const customerPosition = calculatePositionByDomain(CC_BMC_DOMAINS.CUSTOMER_SEGMENTS)
    const channelPosition = calculatePositionByDomain(CC_BMC_DOMAINS.CHANNELS)
    const resourcePosition = calculatePositionByDomain(CC_BMC_DOMAINS.KEY_RESOURCES)

    return {
      thought_process: `用户输入了商业想法："${userPrompt}"。我将创建一个核心价值主张节点（中心位置），并按照CC-BMC框架发散出客户细分（左上）、渠道通路（左下）、核心资源（中下）三个维度的节点，形成结构化的商业画布。`,
      canvas_actions: [
        {
          action: 'create_node',
          data: {
            id: `core-${timestamp}`,
            type: 'cc-bmc-card',
            label: '核心价值主张',
            content: `## 商业想法\n\n${userPrompt}\n\n这是您的核心商业想法，我们将围绕它展开分析。`,
            domain: CC_BMC_DOMAINS.VALUE_PROPOSITIONS,
            position: corePosition,
            metadata: {
              agent_signature: AGENT_TYPES.ORCHESTRATOR,
              confidence: 'medium',
              source: '基于用户输入'
            }
          } as MacraNodeData
        },
        {
          action: 'create_node',
          data: {
            id: `customer-${timestamp}`,
            type: 'cc-bmc-card',
            label: '目标客户',
            content: `## 待分析\n\n请明确您的目标客户群体：\n- 年龄、地域、职业？\n- 痛点是什么？\n- 支付能力如何？`,
            domain: CC_BMC_DOMAINS.CUSTOMER_SEGMENTS,
            position: customerPosition,
            metadata: {
              agent_signature: AGENT_TYPES.MARKET,
              confidence: 'low'
            }
          } as MacraNodeData
        },
        {
          action: 'create_node',
          data: {
            id: `channel-${timestamp}`,
            type: 'cc-bmc-card',
            label: '渠道通路',
            content: `## 待分析\n\n如何触达您的目标客户：\n- 线上还是线下？\n- 直销还是分销？\n- 有哪些关键渠道？`,
            domain: CC_BMC_DOMAINS.CHANNELS,
            position: channelPosition,
            metadata: {
              agent_signature: AGENT_TYPES.MARKET,
              confidence: 'low'
            }
          } as MacraNodeData
        },
        {
          action: 'create_node',
          data: {
            id: `resource-${timestamp}`,
            type: 'cc-bmc-card',
            label: '核心资源',
            content: `## 待分析\n\n实现价值主张需要哪些核心资源：\n- 人力资源？\n- 技术资源？\n- 资金需求？`,
            domain: CC_BMC_DOMAINS.KEY_RESOURCES,
            position: resourcePosition,
            metadata: {
              agent_signature: AGENT_TYPES.PRODUCT,
              confidence: 'low'
            }
          } as MacraNodeData
        },
        {
          action: 'create_edge',
          data: {
            source: `core-${timestamp}`,
            target: `customer-${timestamp}`,
            label: '服务对象',
            type: 'default',
            animated: true
          } as MacraEdgeData
        },
        {
          action: 'create_edge',
          data: {
            source: `core-${timestamp}`,
            target: `channel-${timestamp}`,
            label: '触达方式',
            type: 'default',
            animated: true
          } as MacraEdgeData
        },
        {
          action: 'create_edge',
          data: {
            source: `core-${timestamp}`,
            target: `resource-${timestamp}`,
            label: '资源需求',
            type: 'default',
            animated: true
          } as MacraEdgeData
        }
      ]
    }
  }

  // 一般模式：创建洞察便签，放在画布右侧
  const insightPosition = { x: 850, y: 250 + Math.floor(Math.random() * 100) }

  return {
    thought_process: `用户提出了问题："${userPrompt}"。我将生成一个洞察便签（右侧区域）来回应。`,
    canvas_actions: [
      {
        action: 'create_node',
        data: {
          id: `insight-${timestamp}`,
          type: 'insight-note',
          label: 'AI 洞察',
          content: `## 关于您的问题\n\n"${userPrompt}"\n\n**分析**: 这是一个很好的问题。建议您进一步明确具体细节，以便我能提供更有针对性的建议。\n\n**建议**: 可以尝试将问题拆解为更小的子问题，逐一分析。`,
          position: insightPosition,
          metadata: {
            agent_signature: AGENT_TYPES.ORCHESTRATOR,
            confidence: 'medium'
          }
        } as MacraNodeData
      }
    ]
  }
}
