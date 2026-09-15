# Dify 工作流集成（重构版）

本指南说明当前仓库在“无 Agent Runtime”架构下如何集成 [Dify](https://dify.ai/) 工作流，并在前后端之间复用同一套配置与封装。

## 1. 总览

```
┌───────────────┐           ┌──────────────────┐
│ Next.js 前端  │ --fetch→ │ /api/dify (App Route) │
│  (App Router) │           └──────────────────┘
│   ├─ src/config/dify.ts         │ 调用 Dify API
│   ├─ src/services/DifyService.ts│
│   ├─ src/services/DifyWorkflowService.ts (前端包装)     Dify Cloud / 自建实例
│   └─ src/utils/difyStream.ts    │
│                               │
│ /api/analyze, /api/insights (旧接口) 基于 DifyService 生成摘要与画布节点
└───────────────┘

┌─────────────────────┐
│ packages/server      │
│   ├─ src/services/dify-service.ts    # 服务端调用
│   └─ conversation-store.ts           # 使用 Dify 摘要生成画布
└─────────────────────┘
```

## 2. 环境变量

在根目录 `.env`（或对应部署平台配置）中设置：

```bash
# Dify 基本配置
DIFY_API_BASE_URL=https://api.dify.ai/v1      # 自建服务请改成私有域名
DIFY_DEFAULT_WORKFLOW_ID=content-generation   # 默认工作流逻辑 ID

# 供前端 App Route / API 使用（不会下发到浏览器）
DIFY_CONTENT_APP_ID=xxx                       # Dify 控制台的 App ID
DIFY_CONTENT_API_KEY=sk-xxx                   # 对应 API Key

# 可选：单独为服务端提供只读 Key
DIFY_SERVER_API_KEY=sk-xxx
# 文件翻译（可选）
DIFY_FILE_TRANSLATION_APP_ID=xxx
DIFY_FILE_TRANSLATION_API_KEY=sk-xxx
```

> `frontend/src/config/dify.ts` 会根据是否配置 `appId + apiKey` 自动过滤无效的工作流条目。若未检测到任何可用配置，相关调用会返回占位提示。

## 3. 前端实现

- `src/config/dify.ts`：声明工作流配置列表（逻辑 ID、App ID、API Key、模式等），并提供 `getDifyWorkflow`、`listDifyWorkflows`、`DEFAULT_DIFY_WORKFLOW_ID`。
- `src/lib/env.ts`：统一读取环境变量，带缺失提示与类型转换。
- `src/services/DifyService.ts`：最底层的 fetch 封装，可在服务端和浏览器端复用，支持 `blocking` / `streaming` 两种响应模式。
- `src/utils/difyStream.ts`：解析 Dify SSE 流事件（`message`／`token`／心跳等）。
- `src/services/DifyWorkflowService.ts`：面向 React 组件的包装，默认请求 `/api/dify`，并在流式模式下透传事件。
- `src/app/api/dify/route.ts`：Next.js App Route，接收前端请求（workflowId、inputs、mode），调用 `DifyService` 并按需返回 JSON 或 SSE。
- `src/app/api/file-translation/route.ts`：上传文件到 Dify 并触发 `docs/dify/file-translation.yaml` 对应的 Workflow，返回译文与 token 统计。
- `src/app/api/analyze/route.ts` & `src/app/api/insights/route.ts`：旧接口已迁移至 Dify 方案，调用同一份配置生成摘要与画布节点，不再依赖 LangChain Agent。

## 4. 服务端（packages/server）

- `src/services/dify-service.ts`：Node 环境下的 Dify 调用器，自动读取 `DIFY_SERVER_API_KEY` 等配置，并暴露 `generateSummary` / `runWorkflow`。
- `src/application/conversation-store.ts`：`startConversation` 将调用 `generateSummary`，随后按 Blueprint 生成多层节点（分支 / 维度 / 行动），并通过 GraphQL Subscription 推送。
- `package.json` 已移除 `@starlink/agent-runtime` 依赖，所有智能体逻辑均由 Dify 驱动或回退到模板蓝图。

## 5. 添加新工作流

1. 在 Dify 控制台创建 Workflow，记录 App ID & API Key。
2. 在 `.env` 中新增 `DIFY_<NAME>_APP_ID` 与 `DIFY_<NAME>_API_KEY`（命名自定义），并在 `src/config/dify.ts` 的 `WORKFLOW_CONFIGS` 内追加相应条目。
3. 前端调用示例：
   ```ts
   const workflowService = new DifyWorkflowService()
   await workflowService.executeWorkflow({
     workflowId: 'content-generation',
     inputs: { question: '请生成新能源市场分析摘要' },
     mode: 'streaming',
     onEvent: (event) => console.log(event)
   })
   ```
4. 服务端调用示例：
   ```ts
   const dify = new DifyServerService()
   const summary = await dify.generateSummary('准备发布会方案', 'alice')
   ```

## 6. 常见问题

- **未配置工作流**：`getDifyWorkflow` 会抛出异常，前后端会返回“待配置”提示。请确认 `.env` 中是否提供 App ID 与 API Key。
- **返回 Response**：若误用 `streaming` 模式且未消费 SSE，会收到 `Response` 对象。请使用 `consumeDifyStream` 或在服务端改为 `blocking`。
- **token 泄漏风险**：请避免在浏览器直接构造 `DifyService`，统一通过 `/api/dify` 转发。
- **未返回译文**：确认 Dify Workflow 的终点节点输出了 `translation` / `answer` / `text` 字段，Next.js 会按顺序取第一个非空字段展示。
- **迁移兼容**：旧的 `/api/analyze` / `/api/insights` 仍返回原有结构（summary + nodes/edges），但内部已用 Dify 替换 Agent Runtime。若后续完全切换至新 `src/app` 架构，可逐步废弃这些 legacy 接口。

## 7. 后续计划

- 将 Lesson 内容编辑器中的 `ContentGenerationToolbar` 接入 `DifyWorkflowService`。
- 为 GraphQL 层提供基于 Dify 的流式接口，支持前端实时显示生成进度。
- 补齐 Dify 任务的日志与审计记录，配合 Supabase / R2 资源管理。

至此，项目已完成“移除 Agent Runtime → 采用 Dify 工作流”的核心改造，所有 AI 能力入口统一由 Dify 配置驱动，便于后续扩展与治理。
