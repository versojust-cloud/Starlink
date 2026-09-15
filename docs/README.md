# docs · 文档导航

每个子目录按用途分类，所有 markdown / bib / csv 资料从根目录归整到此处（2026-05-08 整理）。

```
docs/
├── paper/         论文章节、开题报告、文献综述、参考文献库 (.bib / .csv)
├── architecture/  系统架构、多 agent 协作、blackboard 模型、产品定位
├── design/        前端 / 画布 / drawer 视觉设计、UX 改造方案
├── ops/           运维 / 实施 / migration / HITL / KB 增强 / 环境变量
├── research/      竞品对比、外文翻译、研究报告、validation framework
├── changelog/     按版本 / 阶段记录的变更日志
├── architecture/  (子目录) GraphQL gateway 策略
└── dify/          Dify 工作流配置 (.yaml)
```

## paper/

| 文件 | 说明 |
|---|---|
| `outline.md` | 论文整体大纲（8 章 + 实验 + 讨论）|
| `chapter-1-introduction.md` | 第 1 章 引言（RQ1-4 + C1-4）|
| `chapter-7-evaluation.md` | 第 7 章 实验评估（YC 12 case · ablation）|
| `开题报告-模板组织版.md` / `开题报告草稿.md` | 中文开题报告 |
| `技术报告-答辩版.md` | 答辩用技术报告 |
| `opening-report-draft-en.md` | 英文开题草稿 |
| `literature-review-{notes,full-draft}.md` | 文献综述笔记 + 完整草稿 |
| `section-{2,3,4,5}-*.md` | 开题分章节 |
| `references.bib` / `literature-review-cited-refs.bib` | BibTeX 引用库 |
| `reference-{author-lookup-list,priority-table}.csv` | 参考文献元数据 |
| `system-report.docx` | 系统报告 Word 版 |

## architecture/

| 文件 | 说明 |
|---|---|
| `architecture-evidence-grounded-bmc.md` | 12 章 + 2 附录的深度架构设计 |
| `backend-architecture-v2.md` | 后端 v2 架构（langgraph / capability registry）|
| `multi-agent-architecture.md` | 12 agent 团队架构 |
| `multi-agent-quick-reference.md` | 12 agent 速查表 |
| `blackboard-model.md` | Blackboard 共享 state 模型 |
| `final-product-shape-prd.md` | 产品形态 PRD |
| `tools-and-agents.md` | 38 tool + 12 agent inventory |
| `refine-architecture-audit-2026-03-05.md` | 一次架构审计 |
| `架构图说明.md` | 架构图释义 |
| `F-graphql-gateway-strategy.md` | GraphQL gateway 设计 |

## design/

| 文件 | 说明 |
|---|---|
| `frontend-architecture.md` / `frontend-architecture-v2.md` | 前端架构 v1 / v2 |
| `frontend-redesign-plan.md` / `frontend-redesign-for-thesis.md` | 重构方案 |
| `canvas-centric-frontend-framework-v2.md` | 画布中心化 v2 |
| `card-expand-design.md` | 卡片展开交互设计 |
| `comfy-style-canvas-design.md` / `comfy-ui-style-redesign.md` | ComfyUI 风格画布 |

## ops/

| 文件 | 说明 |
|---|---|
| `env.md` | 环境变量速查 |
| `implementation-plan.md` | 实施计划（每 stage 拆分）|
| `frozen-for-demo.md` | 答辩 demo freeze 检查清单 |
| `adding-new-agent-example.md` | 新增 agent 流程 |
| `refactor-summary.md` | 一次重构摘要 |
| `system-analysis-prompt.md` | 系统分析 prompt 模板 |
| `canvas-stitch-prompts.md` | 画布拼接 prompt |
| `hitl-vs-edit.md` | HITL 对比直接编辑 |
| `knowledge-augmentation.md` | KB 增强 RAG |
| `migration-plan.md` | 数据迁移 |
| `dify-integration.md` | Dify 集成 |

## research/

| 文件 | 说明 |
|---|---|
| `research-report.md` | 综合研究报告 |
| `project-summary.md` | 项目总结 |
| `cc-bmc-agent-evolution-plan.md` | CC-BMC agent 演进路线 |
| `validation-framework.md` | 验证框架 |
| `vs-chatgpt-canvas.md` | 对比 ChatGPT Canvas |
| `MetaGPT-外文翻译.md` | MetaGPT 论文外文翻译 |

## changelog/

| 文件 | 说明 |
|---|---|
| `p11-18-p12.md` | P11.18 → P12 sweep 单日 22 commit 详细变更 |

---

**根目录保留 7 个文件**（构建工具 / 公约要求）：
- `README.md` · 项目入口
- `LICENSE.md`
- `CLAUDE.md` · Claude Code 配置
- `AGENTS.md` · Repository Guidelines
- `CONTEXT.md` · Repository context
- `codex.md` · Codex 配置
- `ARCHITECTURE.md` · 代码导航入口（→ docs/architecture/）
