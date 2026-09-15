import { NextResponse } from 'next/server'
import { callLLMWithRetry } from '@/shared/lib/llm'
import type { CriticRequest, CriticResponse } from '@/types/macra'

/**
 * MACRA Adversarial Critic System Prompt
 * 对抗性评论者 - 负责寻找逻辑漏洞和资源冲突
 */
const CRITIC_SYSTEM_PROMPT = `<system_role>
你是 MACRA 架构中的"对抗性评论者 (Adversarial Critic)"。
你的任务是**寻找逻辑漏洞、资源冲突和合规风险**。你是一个挑剔的审计员，不是啦啦队。
</system_role>

<conflict_detection_rules>
请扫描当前画布数据，寻找以下类型的冲突：
1. **资源-目标冲突**：例如，"激进的销售目标" vs "极低的市场预算"。
2. **合规-业务冲突**：例如，"数据跨境回传" vs "中国人类遗传资源管理条例"。
3. **渠道-产品冲突**：例如，"高值医疗器械" vs "纯电商直销模式"。
4. **客户-定价冲突**：例如，"低收入人群" vs "高价格策略"。
5. **资源-能力冲突**：例如，"需要大量AI工程师" vs "初创团队资源有限"。
</conflict_detection_rules>

<output_protocol>
如果没有发现重大冲突，返回 null。
如果发现冲突，请生成"冲突可视化"指令 JSON：

{
  "conflicts": [
    {
      "source_node_id": "node_id_1",
      "target_node_id": "node_id_2",
      "severity": "high" | "medium" | "low",
      "reason": "简述冲突原因，一针见血。",
      "suggestion": "一句话化解建议。",
      "visualization": {
        "action": "create_edge",
        "type": "conflict-link",
        "label": "风险：合规人力不足",
        "style": { "stroke": "#FF0000", "strokeWidth": 2, "animated": true }
      }
    }
  ]
}

**严格要求**:
1. 只标注真正的、有实质影响的冲突，不要过度挑剔
2. severity 的判断标准：
   - high: 会直接导致项目失败或重大损失
   - medium: 需要调整策略，否则会有明显风险
   - low: 需要注意，但不影响大局
3. reason 必须具体，不要泛泛而谈
4. suggestion 必须可执行，不要说废话
5. **必须返回纯 JSON，不要有任何其他文字**
</output_protocol>

<analysis_approach>
1. 先理解整体商业模式的核心逻辑
2. 识别关键假设和依赖关系
3. 寻找矛盾、不一致或风险点
4. 评估严重程度和影响范围
5. 提出具体的化解建议
</analysis_approach>

现在，请分析画布数据，返回纯 JSON 格式的冲突检测结果。如果没有冲突，返回 { "conflicts": null }
`

/**
 * POST /api/macra/critic
 * MACRA 对抗性评论者 - 检测画布冲突
 */
export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as CriticRequest

    const canvasData = payload.canvas_data
    if (!canvasData || canvasData.nodes.length === 0) {
      return NextResponse.json({ conflicts: null })
    }

    // 构建画布摘要
    let canvasContext = `**当前画布节点数**: ${canvasData.nodes.length}\n`
    canvasContext += `**当前画布连接数**: ${canvasData.edges.length}\n\n`

    canvasContext += `**节点详情**:\n`
    canvasData.nodes.forEach((node, idx) => {
      canvasContext += `${idx + 1}. [${node.id}] ${node.label} (${node.type})\n`
      canvasContext += `   维度: ${node.domain || 'N/A'}\n`
      canvasContext += `   内容: ${node.content.substring(0, 100)}${node.content.length > 100 ? '...' : ''}\n\n`
    })

    canvasContext += `**连接关系**:\n`
    canvasData.edges.forEach((edge, idx) => {
      canvasContext += `${idx + 1}. ${edge.source} → ${edge.target} (${edge.label || '无标签'})\n`
    })

    canvasContext += `\n请分析以上画布数据，识别潜在冲突。`

    // 调用 LLM
    const llmResponse = await callLLMWithRetry([
      { role: 'system', content: CRITIC_SYSTEM_PROMPT },
      { role: 'user', content: canvasContext }
    ])

    // 解析 JSON 响应
    let criticResult: CriticResponse
    try {
      const content = llmResponse.content.trim()
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/)
      const jsonString = jsonMatch ? jsonMatch[1] : content
      criticResult = JSON.parse(jsonString)
    } catch {
      console.error('Failed to parse Critic LLM response:', llmResponse.content)

      // Fallback: 返回无冲突
      criticResult = { conflicts: null }
    }

    // 验证冲突数据
    if (criticResult.conflicts && Array.isArray(criticResult.conflicts)) {
      criticResult.conflicts = criticResult.conflicts.filter(conflict => {
        // 验证节点 ID 是否存在
        const sourceExists = canvasData.nodes.some(n => n.id === conflict.source_node_id)
        const targetExists = canvasData.nodes.some(n => n.id === conflict.target_node_id)

        if (!sourceExists || !targetExists) {
          console.warn(`Invalid conflict: source or target node not found`, conflict)
          return false
        }

        return true
      })

      // 如果过滤后没有冲突，返回 null
      if (criticResult.conflicts.length === 0) {
        criticResult.conflicts = null
      }
    }

    return NextResponse.json(criticResult)
  } catch (error) {
    console.error('[api/macra/critic] Error:', error)
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/macra/critic
 * 健康检查
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'MACRA Adversarial Critic',
    version: '1.0.0'
  })
}
