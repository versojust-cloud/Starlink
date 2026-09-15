# 知识增强（RAG）配置 + 量化评估

整理：embedding 从占位切到生产 + LangSmith trace 启用 + 怎么把"知识增强"做成可量化的论文证据。

---

## 1. 当前状态（默认 dev 配置）

| 子系统 | 状态 | 影响 |
|---|---|---|
| Embedding provider | `local-hash`（boot 警告） | 检索质量约等于关键词匹配 — RAG 名存实亡 |
| LangSmith tracing | `false` | 无 LLM 调用链路追踪，无法做 step-level 分析 |
| KB pgvector 表 | ✅ 就绪 | 框架完整，只缺真向量 |
| Citation 解析 + 渲染 | ✅ 完整 | `[[ref:docId#snippetId]]` 全链路通 |
| `kb:reembed` 脚本 | ✅ 就绪 | 一行命令切换后重建所有 embedding |

---

## 2. 切换到真 embedding（按优先级）

### 选项 A · SiliconFlow `BAAI/bge-m3`（推荐，中文友好 + OpenAI 兼容）

```env
# packages/server/.env
EMBEDDING_PROVIDER=remote
EMBEDDING_API_KEY=sk-<在 https://cloud.siliconflow.cn/ 注册免费拿>
EMBEDDING_BASE_URL=https://api.siliconflow.cn/v1
EMBEDDING_MODEL=BAAI/bge-m3
EMBEDDING_DIMENSIONS=1024
```

理由：bge-m3 在中英文混合 + 中文专业术语上稳定优于 OpenAI text-embedding-3-small；SiliconFlow 国内可直连，免代理；2026 年 5 月免费额度仍覆盖 demo 量。

### 选项 B · OpenAI `text-embedding-3-small`

```env
EMBEDDING_PROVIDER=remote
EMBEDDING_API_KEY=sk-<openai key>
EMBEDDING_BASE_URL=https://api.openai.com/v1
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
```

理由：OpenAI 默认 dim 1536，质量高，但需代理 + 美元计费。

### 切换后必跑

```sh
# 1. 重启 server 让新配置生效
pnpm --filter @starlink/server build && cd packages/server && node --env-file=.env dist/index.js

# 2. 把已有 KB chunks 全部重新 embed（旧的是 local-hash 伪向量）
pnpm --filter @starlink/server kb:reembed

# 3. 验证（boot log 应显示 embedding=remote 而非 LOCAL-HASH）
# 4. 检查 health endpoint
curl http://localhost:4000/health/embedding
# 期望：{"mode": "remote", "model": "BAAI/bge-m3", ...}
```

---

## 3. 启用 LangSmith trace

```env
# packages/server/.env
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=lsv2_pt_<在 https://smith.langchain.com/ 注册>
LANGSMITH_PROJECT=starlink-bmc-thesis
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
# 论文阶段免费 5k traces/月够用；超过设采样：
# LANGSMITH_SAMPLING_RATE=0.3
```

启用后，每次 wizard graduation / @-mention / report-writer 调用都会在 LangSmith 上看到完整链路：supervisor → market/product/finance → synthesizer → critic → debate（如果有）→ revision → completion。可截图作答辩素材。

---

## 4. 知识增强的"量化评估"（直击论文 §3.2）

### 4.1 三层评估对应的脚本（已存在但需文档化）

| 层 | 已有脚本 | 输出 |
|---|---|---|
| **功能验证** | `pnpm --filter @starlink/server smoke:all` | 5 个 smoke 测端到端：task-events / conversation-runtime / access-subscriptions / citation-pipeline / hitl-langgraph |
| **效果验证** | `pnpm --filter @starlink/server eval:yc` | 14 个 YC case × 2 runner（starlink vs gpt-solo）× LLM judge |
| **效果验证（KB ablation）** | `pnpm --filter @starlink/server eval:yc-kb` | 同上，但 KB 关闭 vs 开启对比 |
| **个性化效果** | `pnpm --filter @starlink/server eval:coaching` | 2 persona × user-skill 注入 vs baseline |
| **Judge 校准** | `pnpm --filter @starlink/server eval:judge-smoke` | echo / null / generic 控制 |
| **工程验证** | `pnpm --filter @starlink/server test`（203 tests） | 单元 + 集成测试 |

### 4.2 需要补的 RAG ablation 实验设计

**Hypothesis** · 知识增强（KB + RAG）能让 BMC 输出更贴合用户原始资料，可通过 citation 命中率 + 答案-资料相似度量化。

**Setup** · 选 5 个 YC case，每个准备：
- (A) 用户原始 pitch deck PDF（已 ingest 到 KB）
- (B) Wizard 7-step answers
- (C) 期望 BMC ground-truth（人工标注）

**4 个对比组**：
1. `starlink-no-kb` — 走 wizard，不绑 KB
2. `starlink-kb-local` — 绑 KB 但 `EMBEDDING_PROVIDER=local-hash`（当前 dev 状态）
3. `starlink-kb-real` — 绑 KB + 真 embedding（bge-m3）
4. `gpt-solo` — 单 LLM 一次输出 BMC

**Metrics**：
- **citation 覆盖率**：BMC 9 cell 里有多少 cell 至少 1 个 `[[ref:...]]`
- **citation 准确率**：`[[ref:docId#snippetId]]` 解析后，引用的 snippet 是否真的支持该 cell 的论断（LLM judge 评）
- **groundingRate**：每个 cell 的 grounded span / total span（已实现）
- **answer-source 相似度**：BMC cell 内容 vs KB chunk 余弦相似度（用 bge-m3 计算）
- **completeness**：9 维度填充率
- **conflict 检出数**：critic 输出的 high-severity 冲突数（高表示 agent 真的在思考矛盾）

**Expected**：组 3 > 组 1 > 组 4 > 组 2（local-hash 因为伪向量反而比无 KB 更差，因为它会引入"看似引用但实际不相关"的 chunk）。

### 4.3 落地步骤

```sh
# 0. 切到真 embedding（见 §2）+ 重新 embed
pnpm --filter @starlink/server kb:reembed

# 1. 跑 RAG ablation（需要扩 yc-vs-runners 加 4-runner 配置；约 1 天工作量）
# 2. 输出 markdown 报告到 packages/server/benchmark/reports/rag-ablation-<ts>.md
# 3. 把表格 + 每组 1 个完整 BMC 截图贴进论文 §6
```

如果工程时间紧，先跑现有 `eval:yc` + `eval:yc-kb` 拿基线数据，论文里写"RAG 组 vs 无 RAG 组在 citation 覆盖率上从 X% 提升到 Y%"，足够支撑 §3.2 第二条声称。

---

## 5. 常见 boot 警告解读

```
[boot] non-production; 4 config issue(s) would fail in production:
  · INTERNAL_SERVICE_TOKEN: ...     ← 生产前修，dev 可忽略
  · AUTH_MODE: still "disabled"     ← 生产前改 jwt
  · EMBEDDING_PROVIDER: local-hash  ← 见 §2 切换
  · USER_SKILL_ENCRYPTION_KEY: ...  ← 已修（commit 9359192）
[boot] embedding=LOCAL-HASH (poor quality)  ← 同上
```

切完真 embedding 后，最后两条会消失，剩 INTERNAL_SERVICE_TOKEN + AUTH_MODE 两条。
