# Refine Audit (2026-03-05)

## 1. Executive Summary

当前代码已经基本落地你指定的方向：`packages/server` 作为统一对话/画布入口，`backend` 作为 KB 导入任务服务，二者通过任务事件通信，`packages/shared` 作为契约层。

现状可用，但仍存在 3 类需要 refine 的关键问题：

1. 运行态一致性风险：前端存在多处并行消费同一 `conversationProgress` 事件流，缺少统一会话作用域。
2. 可维护性风险：`workspace` 与 `comfy` 两套前端编排调用逻辑重复，容易继续分叉。
3. 稳定性风险：`TaskRunner` / `TaskEventStore` / `ConversationStore` 都有内存态持久化边界，重启与长期运行策略不足。

---

## 2. 前端逻辑整理（apps/web）

### 2.1 页面与入口分工

1. 工作区主画布（任务规划）
   - `/Users/qianyingtao/code/Braching Chat/apps/web/app/(app)/workspace/[workspaceId]/page.tsx`
   - 通过 `CanvasViewport.generateAnalysis()` 发起对话并更新画布。

2. 商业画布（Comfy）
   - `/Users/qianyingtao/code/Braching Chat/apps/web/app/(app)/workspace/[workspaceId]/comfy/page.tsx`
   - 使用 `useComfyStore.callLangGraph()` 同样调用 `startConversation`。

3. Agent 可视化页
   - `/Users/qianyingtao/code/Braching Chat/apps/web/app/(app)/workspace/[workspaceId]/agents/page.tsx`
   - `/Users/qianyingtao/code/Braching Chat/apps/web/app/(app)/workspace/[workspaceId]/agents/[agentId]/page.tsx`
   - 从 `workspaceGraph` 聚合 Agent 贡献，并提供“证据链 + 画布定位”。

4. 研讨会页
   - `/Users/qianyingtao/code/Braching Chat/apps/web/app/(app)/workspace/[workspaceId]/seminar/page.tsx`
   - 聚合 `workspaceGraph` + 实时订阅事件，展示 planning/execution/review/decision。

### 2.2 前端核心数据流

1. 获取画布：`useWorkspaceGraph`
   - `/Users/qianyingtao/code/Braching Chat/apps/web/src/features/workspace/hooks/use-workspace-graph.ts`
   - GraphQL Query: `workspaceGraph(workspaceId)`

2. 写入画布：`useCanvasMutations`
   - `/Users/qianyingtao/code/Braching Chat/apps/web/src/features/workspace/hooks/use-canvas-mutations.ts`
   - GraphQL Mutation: `addNode` / `connectNodes`

3. 对话生成：`CanvasViewport.generateAnalysis`
   - `/Users/qianyingtao/code/Braching Chat/apps/web/src/features/workspace/components/canvas-viewport.tsx`
   - Mutation `startConversation` -> Subscription `conversationProgress` -> 增量更新画布与历史版本。

4. 运行态事件订阅：`useConversationRuntime`
   - `/Users/qianyingtao/code/Braching Chat/apps/web/src/features/workspace/hooks/use-conversation-runtime.ts`
   - 消费 `phase.changed` / `seminar.turn.completed` / `seminar.decision.made`。

### 2.3 前端模块边界

1. `workspace` 特性
   - 面向通用任务规划画布（note/document/task/reference）。

2. `comfy` 特性
   - 面向 MACRA/CC-BMC 节点渲染。
   - 节点类型映射已支持 `meta.macraType` -> `agent-avatar|cc-bmc-card|insight-note|conflict-alert|data-source`。

3. `agent-runtime` 解析层
   - `/Users/qianyingtao/code/Braching Chat/apps/web/src/features/workspace/lib/agent-runtime.ts`
   - 把通用 `workspaceGraph` 转换为 Agent/Seminar 视图数据。

---

## 3. 后端逻辑整理（packages/server + backend）

### 3.1 Gateway（packages/server）

1. API 面
   - `/Users/qianyingtao/code/Braching Chat/packages/server/src/graphql/type-defs.ts`
   - `startConversation`, `workspaceGraph`, `conversationProgress`, KB 相关 Query/Mutation。

2. Resolver 面
   - `/Users/qianyingtao/code/Braching Chat/packages/server/src/graphql/resolvers.ts`
   - 把 GraphQL 映射到 `ConversationStore` 与 `kb-task-service`。

3. 对话编排与事件总线
   - `/Users/qianyingtao/code/Braching Chat/packages/server/src/application/conversation-store.ts`
   - 关键行为：
     1. `startConversation` 创建会话记录并触发 `BusinessLangGraphService.streamConversation`
     2. 把 `init/delta/status` 转成 `conversationProgress` 事件
     3. 额外发布阶段事件 `phase.changed` / `seminar.turn.completed` / `seminar.decision.made`
     4. 持久化 `canvas_graphs`

4. LangGraph 业务逻辑
   - `/Users/qianyingtao/code/Braching Chat/packages/server/src/services/business-langgraph.ts`
   - Node: `routerAgent -> market/product/finance -> orchestrator -> critic`。
   - 输出为画布 delta（节点与边）。

5. KB 任务事件接收
   - `/Users/qianyingtao/code/Braching Chat/packages/server/src/routes/internal-task-events.ts`
   - 接收 backend 发来的任务事件并写入 `TaskEventStore`。

### 3.2 Task Service（backend）

1. 任务创建与推进
   - `/Users/qianyingtao/code/Braching Chat/backend/src/services/ImportService.ts`
   - `addSeed/addFiles/addUrl -> create importTask -> enqueue -> emit event`

2. 任务运行器
   - `/Users/qianyingtao/code/Braching Chat/backend/src/services/TaskRunner.ts`
   - `setTimeout` 内存队列，状态推进 `pending -> processing -> succeeded/failed`。

3. 事件上报
   - `/Users/qianyingtao/code/Braching Chat/backend/src/services/TaskEventService.ts`
   - 将任务状态映射到 `kb.task.*` 事件，上报到 gateway `/internal/task-events`。

---

## 4. 契约层整理（packages/shared）

1. 会话事件契约
   - `/Users/qianyingtao/code/Braching Chat/packages/shared/src/schemas/conversation.ts`
   - 已覆盖：
     1. `graph/appended`
     2. `graph/diff`
     3. `status`
     4. `phase.changed`
     5. `seminar.turn.completed`
     6. `seminar.decision.made`

2. KB 任务事件契约
   - `/Users/qianyingtao/code/Braching Chat/packages/shared/src/contracts/task-events.ts`
   - 统一 `kb.task.created|processing|succeeded|failed` 的 payload schema。

---

## 5. 代码检查发现（按优先级）

### [P1] 画布定位在“数据晚到”时可能失效

- 文件：`/Users/qianyingtao/code/Braching Chat/apps/web/src/features/workspace/components/canvas-viewport.tsx`
- 位置：`focusNodeId` effect（约 239-256 行）
- 问题：effect 依赖没有包含节点变化；当 URL 已有 `focusNodeId` 但节点稍后才加载，可能不会再次触发定位。
- 建议：将 `nodes.length` 或可定位节点状态纳入依赖，或在 `syncTimeline` 后尝试一次延迟定位。

### [P1] 会话事件是“全局广播”，前端按 workspace 过滤仍可能混流

- 文件：`/Users/qianyingtao/code/Braching Chat/packages/server/src/application/conversation-store.ts`
- 位置：`EVENT_TOPIC = 'conversation-progress'` + `getEventIterator()`
- 问题：所有会话共用一个 topic；多个并发会话下，前端需要自行过滤，且 `workspace` 维度不足以保证“只看当前会话”。
- 建议：按 `conversationId` 分 topic，或在 subscription 参数中引入 `conversationId/workspaceId` 服务端过滤。

### [P1] Comfy 与 Workspace 各自维护一套 startConversation 订阅逻辑

- 文件：
  - `/Users/qianyingtao/code/Braching Chat/apps/web/src/features/workspace/components/canvas-viewport.tsx`
  - `/Users/qianyingtao/code/Braching Chat/apps/web/src/features/comfy/store/comfy-store.ts`
- 问题：逻辑重复，后续事件协议变更时容易出现一边更新、一边遗漏。
- 建议：抽出统一 `conversation-runtime-client`（mutation + subscription + delta merge），两端复用。

### [P2] TaskRunner 为内存定时器，不具备崩溃恢复能力

- 文件：`/Users/qianyingtao/code/Braching Chat/backend/src/services/TaskRunner.ts`
- 问题：进程重启后未执行完的任务不会自动恢复。
- 建议：增加“启动扫描 pending/processing 任务并重入队”机制，或迁移到持久化队列。

### [P2] TaskEventStore / ConversationStore 都是无上限内存结构

- 文件：
  - `/Users/qianyingtao/code/Braching Chat/packages/server/src/application/task-event-store.ts`
  - `/Users/qianyingtao/code/Braching Chat/packages/server/src/application/conversation-store.ts`
- 问题：`Set/Map` 无 TTL/容量控制，长期运行可能导致内存增长。
- 建议：增加 LRU/TTL 清理策略；重要数据落库并做冷热分层。

### [P3] GraphQL ConversationEvent 仍是弱类型外露

- 文件：`/Users/qianyingtao/code/Braching Chat/packages/server/src/graphql/type-defs.ts`
- 问题：`ConversationEvent` 对外只有 `type/status/message/payload(JSON)`，前端类型安全仍依赖本地断言。
- 建议：可增量引入 GraphQL Union/Interface（至少对 phase/seminar 事件给出显式字段）。

---

## 6. Refine 建议路线（可直接执行）

### Phase A（先稳住）

1. 统一前端对话客户端层
   - 抽离 `startConversation + ws subscribe + delta merge + completion` 为单一 hook/service。
2. 修复焦点定位时序问题
   - 补齐 `focusNodeId` 在“晚到节点”场景的重试定位。
3. 订阅过滤收敛
   - `conversationProgress` 改为可接收 `conversationId` 参数，服务端过滤后返回。

### Phase B（增强可维护）

1. 事件协议版本化
   - 在 shared 契约里新增 `eventVersion`，前端按版本分支处理。
2. 研讨会状态机显式化
   - 把 `phase` 切换规则从“节点内容推断”升级为后端显式状态机（guard + transition）。
3. Agent 证据链标准化
   - 在 node `meta` 写入 `evidenceRefs`，避免前端只能靠边关系猜测证据链。

### Phase C（生产化）

1. 任务队列持久化
   - TaskRunner 迁移为持久化队列（或最小化先做启动恢复）。
2. 内存存储治理
   - Conversation/TaskEvent store 加 TTL/LRU + 指标观测。
3. 灰度开关
   - 对 `phase/seminar` 新事件加 feature flag，支持回退。

---

## 7. 建议补充测试

1. E2E：同一 workspace 并发两次 `startConversation` 的事件隔离测试。
2. E2E：`focusNodeId` 在节点异步加载后的定位测试。
3. Integration：`phase.changed -> seminar.turn.completed -> seminar.decision.made` 顺序保证测试。
4. Backend：TaskRunner 进程重启恢复测试（若实现恢复逻辑）。
