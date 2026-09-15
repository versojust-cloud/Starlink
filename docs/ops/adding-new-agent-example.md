# 添加新 Agent · 两步走

> v2 · Phase 2 post-migration version
>
> 所有 agent 住在 `packages/server/src/agents/<name>/{agent.yaml, graph.ts}` 并通过
> `agentRegistry`/`advisorRegistry` 自动被 Supervisor 发现。

## 设计原则

添加一个新 agent = **建一个子目录 + 写两个文件**。无需改 supervisor、无需改
`business-langgraph.ts`。

三层分离：

| 层 | 文件 / 字段 | 给谁看 |
|---|---|---|
| **Layer 1 · Capability** | `agent.yaml` 的 `capabilities:` | Supervisor LLM — 决定要不要路由给你 |
| **Layer 2 · Agent** | `graph.ts` 的 `buildSubgraph()` | LangGraph 编译器 |
| **Layer 3 · Tools** | `agent.yaml` 的 `tools:` | 子图内部的 `llm.bindTools(...)` |

---

## 示例：添加 `Risk_Agent`

### 第 1 步 · `agent.yaml`

```bash
mkdir -p packages/server/src/agents/risk
```

```yaml
# yaml-language-server: $schema=../../../agent-schema.json
version: 1
id: risk-agent
name: Risk Agent
role: generator

language: zh-CN
model: gpt-4o-mini
temperature: 0.3
max_tokens: 1600
timeout_ms: 30000

tools:
  - knowledge-base
  - web-search

capabilities:
  - { kind: critique, mode: evidence-checker }
  - { kind: generate, dimension: KEY_RESOURCES }

system_prompt: |
  你是 Risk_Agent（风险评估专家）...
```

### 第 2 步 · `graph.ts`

```ts
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  makeProfileGetter,
  profileToDescriptor,
  registerAgent
} from '../../capabilities/index.js'
import { createLLMModelFor } from '../../services/llm-factory.js'
import { buildBmcGeneratorSubgraph } from '../shared/bmc-generator-subgraph.js'
import { resolveLangchainToolsForAgent } from '../shared/register-helpers.js'
import { AGENT_TYPES } from '../shared/parsing.js'

const here = dirname(fileURLToPath(import.meta.url))
const getProfile = makeProfileGetter(join(here, 'agent.yaml'))

export const ready: Promise<void> = (async () => {
  const profile = await getProfile()
  const model = createLLMModelFor(profile)
  const lcTools = resolveLangchainToolsForAgent(profile)
  const compiled = buildBmcGeneratorSubgraph(profile, model, lcTools, {
    outputField: 'productNodes',
    domains: ['核心资源'],
    agentType: AGENT_TYPES.PRODUCT,
    loggerName: 'agents.risk.graph'
  })
  registerAgent(profileToDescriptor(profile, () => compiled))
})()
```

### 完毕

- Auto-scan 启动时发现 → import → registerAgent side-effect
- Supervisor 下次会把 Risk_Agent 纳入候选列表

---

## Advisor 变体

```yaml
role: advisor
capabilities:
  - { kind: critique, mode: logical-auditor }
```

```ts
import { profileToAdvisorDescriptor, registerAdvisor, type RelevanceScorer } from '../../capabilities/index.js'

const relevanceScorer: RelevanceScorer<{ roundNumber?: number }> = (s) =>
  (s.roundNumber ?? 0) > 0 ? 1 : 0

registerAdvisor(profileToAdvisorDescriptor(profile, () => compiled, relevanceScorer))
```

---

## 校验：`pnpm validate:agents`

```bash
pnpm --filter @starlink/server validate:agents
```

扫描 `agents/*/agent.yaml`，每个跑 `AgentProfileSchema.parse`，并校验
`tools:` 声明的工具名都在 ToolRegistry 里。CI 护栏。
