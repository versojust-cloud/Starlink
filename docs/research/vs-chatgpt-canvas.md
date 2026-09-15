# 与 ChatGPT + Canvas / Claude Artifact 的本质区别

整理：答辩问"你这不就是 ChatGPT + Canvas 吗"时的一句话回答 + 5 条具体差别。

---

## 一句话区别

> ChatGPT + Canvas 是**单 LLM 生成 + 用户在 canvas 上直接修改**；本系统是**多智能体协同分析 + 结果落在结构化 9 维 BMC + 系统主动检测冲突 + 用户决策注入下一轮路由**。

前者 canvas 是**输出表面**（display surface）；后者 canvas 是**结构化协作空间**（structured collaboration substrate）。

---

## 5 条具体差别

| 维度 | ChatGPT + Canvas | Claude Artifact | Starlink BMC Canvas |
|---|---|---|---|
| **生成主体** | 单 LLM 一次输出 | 单 LLM 一次输出 | **12 个角色化 agent** 协同（market / product / finance / critic / synthesizer / report-writer / ... ） |
| **输出结构** | 自由文本 / Markdown | HTML / React 组件 / SVG / Markdown | **强约束 9 维 BMC 网格**（客户细分 / 价值主张 / 收入来源 等），每 cell 必须有 owner agent |
| **节点间关系** | 无显式关系 | 无显式关系 | **synthesizer 推导跨维度边**（如"价值主张 → 服务于 → 客户细分"）+ critic 检出冲突边 |
| **冲突检测** | 没有 | 没有 | **专门的 critic agent + adversarial debate** 检出 resource-goal / channel-product / compliance-business 类冲突 |
| **人在回路** | 用户改文本 | 用户改组件 | **系统主动暂停 + 用户结构化决策 (`[EDIT_PLAN][维度]:body`) 影响下一轮路由** |
| **知识增强** | 默认无 RAG，需用户上传 | 默认无 RAG | **每个 agent 自动绑 KB**，输出含 `[[ref:docId#snippetId]]` 内联引用 + grounding rate 度量 |
| **跨会话学习** | ChatGPT memory 仅自然语言 | Claude memory 类似 | **user-skill 表抽 trait + workspace canvas memory + 跨 idea 注入下次 BMC system prompt** |
| **个性化** | 无显式 | 无显式 | **userSkillBlock 注入 prompt**（如"用户偏好具体数字胜于框架"）影响 agent 输出风格 |

---

## 关键区别点的代码出处

### 1. 多智能体而非单 LLM

`packages/server/src/agents/` 下 12 个目录，每个含 `agent.yaml` + `graph.ts`：
- market / product / finance — 3 个 generator
- critic — 1 个 advisor
- synthesizer — 1 个 generator（合成 + 边）
- general-responder / deep-research / report-writer — 3 个 utility
- market-opponent / product-opponent / finance-opponent — 3 个 debate-side
- moderator — 1 个 debate-judge

每个有自己的 system_prompt / tools / temperature / model 配置。supervisor 节点 (`runSupervisor`) 决定每轮哪些 agent 跑。

### 2. 强约束输出结构

`packages/shared/src/schemas/bmc.ts` 的 `bmcAnalysisCardSchema`：
```ts
{ domain: ccBmcDomainSchema /* 9 个枚举 */, summary, content, confidence }
```

`packages/server/src/services/business-langgraph/parsing.ts:296` 的 `cc-bmc-card` 类型——agent 输出必须分到这 9 个域之一，否则 `ruleBasedCriticCheck` 会把它识别成"未分类"并报警。

ChatGPT/Claude 没有这种结构强制。

### 3. 跨节点关系的合成

`packages/server/src/agents/synthesizer/graph.ts` 输出 `edges: { source, target, label }[]`，标签如"服务于" / "支撑" / "带来" / "产生" — 自动建立 BMC 9 cell 之间的因果链。

ChatGPT 输出 BMC 是 9 个独立段落，没有这种 graph relationship。

### 4. 冲突检测 + 修订闭环

`packages/server/src/agents/critic/graph.ts` 输出 `conflicts: { conflictType, severity, relatedAgents, ... }[]`。
4 类冲突：
- `resource-goal` — 关键资源与收入目标错配
- `channel-product` — 渠道与产品定位不符
- `compliance-business` — 合规约束与业务模型冲突
- `other` — 其他

每个 conflict 触发 supervisor 决定：自动 round-2 修订 vs 暂停等 HITL 决策（高严重度时）。

`business-langgraph.ts:745` 的 conditional edge:
```ts
.addConditionalEdges('critic', (state) => {
  if (hasHighSeverity && state.roundNumber < MAX_ROUNDS) return ['supervisor']  // 回到 supervisor 路由
  return [END]
})
```

ChatGPT/Claude 不会"发现自己输出有冲突主动改"。

### 5. 人在回路决策影响路由

见 `docs/hitl-vs-edit.md` —— `interrupt()` + `resumeConversation` mutation + grammar `[EDIT_PLAN][维度]:body` 决策 → supervisor 下一轮只跑该维度的 owner agent。

### 6. RAG + grounding rate

`packages/server/src/services/embedding-service.ts` + `kb-task-service.ts` + `tools/data-source/knowledge-base.tool.ts` —— 每个 agent 通过 `knowledge-base` tool 自动检索 workspace KB。citation 解析 (`packages/shared/src/citation/`) 把 `[[ref:docId#snippetId]]` 转成可点击 chip + 计算 grounding rate（< 30% 红色警示）。

ChatGPT 默认无 RAG。Canvas 也不接 RAG。

### 7. 跨会话个性化

`packages/server/src/services/user-skill-extractor.ts` —— 每次 conversation 后抽 user trait（如"5 年 B2B SaaS 背景，偏好具体数据胜于框架"），存 `memory_items.kind='user-skill'`。下次任意 workspace 起 wizard / BMC 时，`buildUserSkillPrompt()` 注入到 system prompt 里。

ChatGPT 的 memory 是它自己写自然语言，由它自己读。我们的 user-skill 是结构化的 + 跨 workspace + 可被用户编辑/删除。

---

## 论文怎么写（§1.4 / §2 相关工作 模板）

> 与 OpenAI ChatGPT Canvas（2024）和 Anthropic Claude Artifact（2024）的"单 LLM 直接生成 + 用户编辑"不同，本系统将 BMC 生成视为多智能体协同任务：12 个角色化 agent 通过 LangGraph 状态图共享 BusinessState 黑板（见 §3.1），其中 critic agent 主动检测维度间冲突并触发 HITL 决策点，用户决策通过结构化 grammar 注入 supervisor 路由层，影响下一轮哪些 agent 参与修订。canvas 在本系统中不仅是输出展示，更是工作空间：节点之间存在显式语义边（synthesizer 输出），冲突边（critic 输出），且支持用户编辑触发选择性重跑。此外，集成 RAG 检索 + grounding rate 度量使每条 BMC 论断的可验证性显式量化（< 30% 红色警示），并通过 user-skill 跨会话个性化机制让系统的输出风格随用户使用历史适应。这些差异在表 1-1 中对照。

---

## 答辩追问 + 应对

> Q: ChatGPT 也可以加 RAG 啊（GPTs / Custom GPTs）。
> A: 对，但默认形态是单 LLM。我们是**架构级的 multi-agent + RAG**，不是用户配置出来的。critic + synthesizer + opponent 这些角色 ChatGPT 用户配不出来。

> Q: 这个 9 维 BMC 强约束 ChatGPT 也能用 prompt 实现啊。
> A: prompt 实现 ≠ schema 强制。我们用 `bmcAnalysisCardSchema` Zod 验证 + parseBmcAnalysisOutput 的 fallback rejection（见 `parseBmcAnalysisOutput rejects fake fallback domains` 测试）。LLM 输出不合规直接拒绝重生成，不是"看上去对就接受"。

> Q: 用户编辑能不能触发重跑？
> A: 可以——`@critic` mention 重跑冲突检测；`@market-agent 帮我补 客户细分` 让市场 agent 单独补一格。这是普通编辑做不到的。
