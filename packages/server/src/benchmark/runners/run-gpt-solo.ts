import type { BenchmarkCase, BenchmarkRun } from '../types.js'
import { LLMClient } from '../../services/llm-client.js'

/**
 * gpt-solo runner: a single LLM call producing the full 9-cell BMC.
 *
 * The N=8 / N=12 evals revealed a structural quirk: this runner
 * scored 0/3 on KEY_PARTNERSHIPS in 100% of cases — the model
 * silently omits one cell when asked to produce 9 in one shot.
 * The `forceNineCells` flag tightens the prompt with an explicit
 * "you MUST output all 9 cells in this exact order" instruction
 * so we can isolate whether multi-agent's structural advantage
 * survives a fairer baseline.
 */
export async function runGptSolo(
  c: BenchmarkCase,
  options: { forceNineCells?: boolean } = {}
): Promise<BenchmarkRun> {
  const startedAt = new Date()
  const t0 = Date.now()

  const knowledge =
    (c.input.workspace_knowledge ?? [])
      .map((k, i) => `${i + 1}. [${k.title}] ${k.content}`)
      .join('\n') || '（无）'
  const constraints = (c.input.constraints ?? []).join('\n- ') || '（无）'

  const coverageRequirement = options.forceNineCells
    ? `\n## 强制覆盖要求\n你**必须**输出全部 9 个 CC-BMC 维度，按以下顺序：客户细分、价值主张、渠道通路、客户关系、收入来源、核心资源、关键业务、重要合作、成本结构。任何维度缺失都视为输出无效。每个维度至少 1 个 cc-bmc-card 节点。\n`
    : ''

  const prompt =
    '你是一个商业策略分析师。请根据以下问题与参考资料，生成完整的 CC-BMC 九维商业模型画布。\n\n' +
    `## 问题\n${c.input.question}\n\n` +
    `## 参考资料\n${knowledge}\n\n` +
    `## 约束\n- ${constraints}\n` +
    coverageRequirement +
    `\n请输出 JSON 数组，每项为 { "domain": "客户细分|...", "content": "...", "metadata": { "confidence": "high|medium|low" } }`

  let bmcNodes: unknown[] = []
  let err: string | undefined

  try {
    const client = new LLMClient()
    const response = await client.chat({
      messages: [
        { role: 'system', content: '你是一个商业策略分析师，输出结构化 JSON。' },
        { role: 'user', content: prompt }
      ]
    })
    const content = response.content ?? ''
    const match = content.match(/\[[\s\S]*\]/)
    if (match) {
      try { bmcNodes = JSON.parse(match[0]) as unknown[] } catch { bmcNodes = [] }
    }
  } catch (e) {
    err = (e as Error).message
  }

  const endedAt = new Date()
  return {
    case_id: c.case_id,
    runner: options.forceNineCells ? 'gpt-solo-forced' : 'gpt-solo',
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_ms: Date.now() - t0,
    output: { bmc_nodes: bmcNodes, handoff_count: 0 },
    error: err
  }
}
