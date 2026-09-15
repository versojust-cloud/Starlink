# 设计系统使用指南

## 概述

这是 Branching Chat 的温暖人性化设计系统。它提供了一套完整的设计 tokens 和可复用组件，确保整个应用保持一致的视觉风格。

## 设计理念

### 核心特征
- 🎨 **温暖的色彩**：桃色、珊瑚色、奶油色，告别冷冰冰的蓝紫色
- ✨ **有机的形状**：流动的背景、圆润的卡片、柔和的边角
- 💫 **温柔的动效**：渐显、悬浮、呼吸感的微交互
- 🌟 **人文字体**：衬线字体标题 + 圆润的正文字体

## 快速开始

### 导入设计系统

```typescript
import {
  // Tokens
  colors,
  gradients,
  borderRadius,
  shadows,
  typography,
  animations,

  // 组件
  WarmButton,
  WarmCard,
  OrganicBackground,

  // 工具
  cn
} from '@/shared/design-system'
```

## 组件使用

### WarmButton - 温暖按钮

```tsx
import { WarmButton } from '@/shared/design-system'

// 主要按钮（珊瑚色渐变）
<WarmButton variant="primary">
  开始使用
</WarmButton>

// 次要按钮（边框样式）
<WarmButton variant="secondary">
  了解更多
</WarmButton>

// 幽灵按钮（半透明玻璃效果）
<WarmButton variant="ghost">
  取消
</WarmButton>

// 深色按钮
<WarmButton variant="dark">
  立即购买
</WarmButton>

// 不同尺寸
<WarmButton size="sm">小按钮</WarmButton>
<WarmButton size="md">中等按钮</WarmButton>
<WarmButton size="lg">大按钮</WarmButton>

// 作为链接
<WarmButton href="/dashboard">
  进入控制台
</WarmButton>
```

### WarmCard - 温暖卡片

```tsx
import { WarmCard } from '@/shared/design-system'

// 默认卡片
<WarmCard>
  <h3>卡片标题</h3>
  <p>卡片内容...</p>
</WarmCard>

// 渐变背景卡片
<WarmCard variant="gradient">
  内容...
</WarmCard>

// 玻璃态卡片
<WarmCard variant="glass">
  内容...
</WarmCard>

// 可悬浮交互的卡片
<WarmCard hoverable>
  悬停时会有上升效果
</WarmCard>

// 不同尺寸
<WarmCard size="sm">小卡片</WarmCard>
<WarmCard size="md">中等卡片</WarmCard>
<WarmCard size="lg">大卡片</WarmCard>
<WarmCard size="xl">超大卡片</WarmCard>
```

### OrganicBackground - 有机背景

```tsx
import { OrganicBackground } from '@/shared/design-system'

// 默认背景（包含噪点纹理）
<div className="relative">
  <OrganicBackground />
  <div className="relative z-10">
    你的内容...
  </div>
</div>

// 自定义渐变色
<OrganicBackground gradient="from-blue-100 to-purple-100" />

// 不显示噪点
<OrganicBackground showNoise={false} />
```

## 设计 Tokens

### 色彩系统

```typescript
import { colors } from '@/shared/design-system'

// 主色调
colors.primary.coral    // #FF9B8A
colors.primary.peach    // #FFB4A2
colors.primary.light    // #FFC8B8

// 奶油色
colors.cream.base       // #FFF4E6
colors.cream.light      // #FFF8F0

// 点缀色
colors.accent.green     // #7FC89D
colors.accent.lightGreen // #A8D5BA

// 中性色
colors.neutral[50]      // 到 colors.neutral[900]
```

### 渐变

```tsx
import { gradients } from '@/shared/design-system'

<div className={`bg-gradient-to-br ${gradients.background}`}>
  背景渐变
</div>

<div className={`bg-gradient-to-r ${gradients.primary}`}>
  主色渐变
</div>
```

### 圆角

```tsx
import { borderRadius } from '@/shared/design-system'

// 在 Tailwind 中使用
<div className="rounded-[20px]">  {/* 对应 borderRadius.card.sm */}
<div className="rounded-[24px]">  {/* 对应 borderRadius.card.md */}
<div className="rounded-[28px]">  {/* 对应 borderRadius.card.lg */}
```

### 阴影

```tsx
import { shadows } from '@/shared/design-system'

<div className={shadows.card.md}>
  带阴影的卡片
</div>

<button className={shadows.button.primary}>
  带阴影的按钮
</button>
```

### 排版

```tsx
import { typography } from '@/shared/design-system'

<h1 className={`${typography.fontFamily.serif} ${typography.heading.h1}`}>
  大标题
</h1>

<p className={typography.fontFamily.sans}>
  正文内容
</p>
```

## Framer Motion 动画

### 使用预定义的动画变体

```tsx
import { motion } from 'framer-motion'
import { animations } from '@/shared/design-system'

// 渐显向上
<motion.div
  initial="hidden"
  animate="visible"
  variants={animations.fadeInUp}
>
  内容
</motion.div>

// 渐显缩放
<motion.div
  initial="hidden"
  animate="visible"
  variants={animations.fadeInScale}
>
  内容
</motion.div>

// 交错动画容器
<motion.div
  initial="hidden"
  animate="visible"
  variants={animations.staggerContainer}
>
  <motion.div variants={animations.fadeInUp}>子元素 1</motion.div>
  <motion.div variants={animations.fadeInUp}>子元素 2</motion.div>
  <motion.div variants={animations.fadeInUp}>子元素 3</motion.div>
</motion.div>

// 浮动动画
<motion.div animate={animations.floating}>
  浮动元素
</motion.div>

// 悬停效果
<motion.button whileHover={animations.hover} whileTap={animations.tap}>
  按钮
</motion.button>
```

## 最佳实践

### 1. 保持一致性
- 始终使用设计 tokens 而不是硬编码颜色值
- 使用预定义的组件而不是每次都写新样式
- 遵循既定的间距系统

### 2. 温暖感的营造
- 优先使用柔和的圆角而非直角
- 使用温暖的阴影效果
- 添加温柔的动画过渡

### 3. 可访问性
- 确保文字对比度足够
- 为交互元素提供适当的焦点样式
- 保持合理的字体大小

### 4. 性能优化
- 优先使用 CSS 动画而非 JavaScript
- 避免过度使用复杂的滤镜效果
- 合理使用 backdrop-blur（在移动端可能影响性能）

## 示例：创建一个新页面

```tsx
import {
  OrganicBackground,
  WarmCard,
  WarmButton,
  gradients,
  animations
} from '@/shared/design-system'
import { motion } from 'framer-motion'

export default function MyPage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* 有机背景 */}
      <OrganicBackground />

      {/* 内容 */}
      <div className="relative z-10 container mx-auto px-6 py-16">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={animations.staggerContainer}
          className="space-y-12"
        >
          {/* 标题 */}
          <motion.h1
            variants={animations.fadeInUp}
            className="font-serif text-5xl font-bold text-neutral-900"
          >
            欢迎使用 <span className={`bg-gradient-to-r ${gradients.primarySimple} bg-clip-text text-transparent`}>
              Branching Chat
            </span>
          </motion.h1>

          {/* 卡片 */}
          <WarmCard variant="gradient" hoverable>
            <h2 className="font-serif text-2xl font-bold text-neutral-900">
              功能介绍
            </h2>
            <p className="mt-4 text-neutral-600">
              这是一个示例卡片...
            </p>
          </WarmCard>

          {/* 按钮组 */}
          <div className="flex gap-4">
            <WarmButton variant="primary" size="lg">
              开始使用
            </WarmButton>
            <WarmButton variant="secondary" size="lg">
              了解更多
            </WarmButton>
          </div>
        </motion.div>
      </div>
    </main>
  )
}
```

## 扩展设计系统

如果需要添加新的设计 tokens 或组件：

1. 在 `tokens.ts` 中添加新的 token 定义
2. 在 `components/` 目录创建新组件
3. 在 `index.ts` 中导出新内容
4. 更新本文档

## 反馈与改进

如果你发现设计系统的不足或有改进建议，请：
1. 在团队会议中提出
2. 创建 issue 讨论
3. 提交 PR 并附上详细说明

---

**记住：温暖、人性化、有机感是我们的设计核心。每个决策都应该围绕这些原则展开。** ✨
