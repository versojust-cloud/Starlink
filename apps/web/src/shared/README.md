# Shared Module

跨功能域共享的代码和资源。

## 目录结构

```
shared/
├── components/      # 通用UI组件
│   ├── ui/         # shadcn/ui组件
│   ├── layout/     # 布局组件
│   └── common/     # 通用组件
├── hooks/          # 通用hooks
├── lib/            # 工具函数和服务
│   ├── supabase.ts
│   ├── llm.ts
│   └── utils.ts
└── types/          # 通用类型定义
```

## 原则

只放真正需要在多个feature之间共享的代码。
如果一个组件/hook只被一个feature使用，应该放在该feature目录下。
