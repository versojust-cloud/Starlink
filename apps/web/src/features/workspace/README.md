# Workspace Feature

工作台功能域 - 负责Canvas画布相关的所有功能。

## 目录结构

```
workspace/
├── components/      # Workspace专属组件
├── hooks/          # Workspace专属hooks
├── store/          # Workspace专属状态管理
├── services/       # Workspace专属服务
└── types/          # Workspace专属类型定义
```

## 待迁移组件

从现有代码迁移以下组件到此目录：

- [ ] `components/workspace/canvas-viewport.tsx`
- [ ] `components/workspace/assistant-panel.tsx`
- [ ] `components/workspace/canvas-toolbar.tsx`
- [ ] `components/workspace/node-palette.tsx`
- [ ] `components/workspace/document-drawer.tsx`
- [ ] `store/canvas-store.ts`
- [ ] `hooks/use-canvas-mutations.ts`
