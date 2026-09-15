# Kuse Frontend (Next.js)

This app houses the Next.js implementation for the Kuse multi-dimensional research canvas. It follows the architecture described in `docs/frontend-architecture.md`.

## Getting Started

```bash
# 推荐：使用 Bun（已在仓库中使用）
bun install
bun run dev

# 或使用 npm
npm install
npm run dev

# 若安装了 pnpm，也可在仓库根目录
pnpm install
pnpm --filter kuse-frontend dev
```

Key directories:

- `app/(marketing)` – public landing experience.
- `app/(app)/dashboard` – workspace dashboard shell.
- `app/(app)/workspace/[workspaceId]` – core canvas surface and side panels.
- `components/workspace` – workspace modules（CanvasViewport、AssistantPanel、DocumentDrawer、CanvasToolbar、NodePalette 等）。
- `store/canvas-store.ts` – Zustand 状态，用于控制面板显隐、缩放等 UI 状态。
- `lib/graphql-client.ts` – GraphQL 客户端，默认指向 `http://localhost:4000/graphql`。
- `hooks/use-workspace-graph.ts` / `hooks/use-canvas-mutations.ts` – GraphQL 查询与变更封装。

## Backend

Canvas graph data is served from `http://localhost:4000/graphql`. Start the backend service provided in this repo:

```bash
cd backend
npm install
npm run dev
```

Set `NEXT_PUBLIC_GRAPHQL_URL` in `.env` if you need to target a different API endpoint.

## End-to-end Tests

Playwright powers the basic UI regression suite.

```bash
# Install browser binaries once
npx playwright install

# Run headless tests (dev server auto-starts)
npm run test:e2e

# Run knowledge suite only
npm run test:e2e:knowledge

# Run knowledge flow only
npm run test:e2e:knowledge:flow

# Run knowledge recovery only
npm run test:e2e:knowledge:recovery

# Run headed for debugging
npm run test:e2e:headed
```

> The current implementation contains placeholder data to illustrate layout and data flow structure.
