# 新架构迁移总览

本计划将现有 `frontend/` + `packages/*` 组合逐步迁移到以 `src/` 为主的 Next.js App Router 架构，并引入 Supabase + NextAuth + Dify 集成。迁移期间保留原有画布功能，分阶段切换。

## 目标结构

```
src/
├── app/                              # Next.js App Router
│   ├── (marketing)/...
│   ├── dashboard/page.tsx
│   ├── lesson/[id]/                  # 课程编辑器入口
│   │   ├── components/               # Lesson 专属组件
│   │   └── page.tsx
│   ├── api/
│   │   └── dify/route.ts             # Dify 工作流代理
│   └── layout.tsx
├── components/                       # 跨特性共享 UI
├── features/                         # 领域逻辑（quests、chapters 等）
├── lib/                              # Supabase、NextAuth、HTTP、R2Client 等
├── config/
│   ├── dify.ts                       # 工作流与凭据映射
│   └── r2.ts                         # 版本化资源配置
└── styles/                           # Tailwind 引导文件
```

Supabase schema 侧重 `quests -> chapters -> lessons -> elements`，每个 lesson 拥有 `phase_learning` / `phase_practice` / `phase_challenge` / `phase_play` 等字段。后续将通过 SQL migration 或 Supabase CLI 管理。

## 阶段划分

1. **基础脚手架**
   - 新建 `src/` 目录及最小页面（示例 dashboard）。
   - 配置 Tailwind v4 / React 19 / NextAuth / Supabase 客户端。
   - 将 `config/keys.ts` 更正为环境变量读取，迁移到 `src/lib/env.ts`。

2. **Dify 工作流闭环**
   - 实现 `src/config/dify.ts` + `src/services/DifyService.ts`。
   - 新建 `src/app/api/dify/route.ts`，支持 blocking + SSE。
   - 编写前端工具 `src/utils/difyStream.ts`、`src/services/DifyWorkflowService.ts`。
   - 在 `lesson/[id]/components/ContentGenerationToolbar/` 中接入。

3. **数据模型迁移**
   - 在 Supabase 建表并生成类型定义。
   - 将 `frontend` 中画布入口移植到新 `src/app/workspace/[id]/` 页面，替换数据来源。
   - 引入 NextAuth 会话守卫，按组织/租户隔离。

4. **收敛旧模块**
   - 将 Dify 工作流作为统一入口，旧 `packages/agent-runtime` 已移除（如需参考可从历史版本获取）。
   - 逐步淘汰旧 `frontend/` 与 GraphQL 接口，或将 GraphQL 通过 App Router handler 暴露。
   - 在最终阶段清理旧目录与脚本。

## 近期任务清单

- [x] 新建 `src/` 基础目录与最小页面、布局。
- [ ] Tailwind v4 + React 19 升级校验。
- [x] `config/keys.ts` 调整至 `.env` 驱动。
- [ ] 起草 Supabase schema 定义草稿。
- [x] 实现 Dify 配置与服务骨架（先使用 mock，后续接入真实接口）。
- [x] 移除 LangChain Agent runtime 依赖，统一切换至 Dify 工作流。

更新频率：每完成一个阶段或重大子任务同步此文档。
