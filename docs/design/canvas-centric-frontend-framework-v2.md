# 前端业务框架 V2

## 核心判断

这个产品的核心不应该是知识库，也不应该是研究页。

核心应该是：

`智慧画布 = 工作区唯一主战场`

其它页面都围绕它服务。

因此新的业务框架应该从“多页面并列”调整为“一个主工作台 + 一组工具页 + 一组输出页”。

---

## 一句话版本

用户进入工作区后，主要在智慧画布里完成问题拆解、证据挂接、策略推演与决策沉淀。

知识库、深度研究、翻译、数据洞察不再是并列主页面，而是智慧画布的工具页。

练习、跨文化表达、社区不再是独立主链路，而是输出与反馈层。

---

## 新的信息架构

### 1. Workspace Home

定位：

- 项目概览
- 恢复入口
- 最近产物
- 推荐继续点

不承载：

- 复杂编辑
- 资料导入
- 策略建模

对应路由：

- `/workspace/[workspaceId]`

---

### 2. 智慧画布

定位：

- 工作区主战场
- 问题拆解中心
- 证据挂接中心
- 策略建模中心
- 决策沉淀中心

它应该承载的内容：

- 主问题树
- 证据节点
- 研究结论节点
- Agent 建议
- 冲突与假设
- 行动路径
- 当前推荐下一步

对应路由：

- `/workspace/[workspaceId]/canvas`

说明：

- 这个页面应当成为工作区默认推荐入口
- 未来 `comfy` 的核心能力应逐步并入这里

---

### 3. 工具页

这些页面不是主链路页面，而是为智慧画布服务的工具。

#### 3.1 知识库

定位：

- 资料导入
- 知识沉淀
- 证据管理
- 为画布提供可引用内容

对应路由：

- `/workspace/[workspaceId]/knowledge`

在系统中的角色：

- 工具页
- 证据供给页
- 不是主战场

#### 3.2 深度研究

定位：

- 针对某一问题做深度分析
- 输出结构化研究结论
- 将结果回灌到画布

对应路由：

- `/workspace/[workspaceId]/deep-research`

在系统中的角色：

- 分析工具页

#### 3.3 翻译

定位：

- 处理外文资料
- 将多语内容转成可研究、可引用资产

对应路由：

- `/workspace/[workspaceId]/translate`

在系统中的角色：

- 预处理工具页

#### 3.4 数据洞察

定位：

- 结构化数据分析
- 图表与摘要输出
- 为画布生成数据证据

对应路由：

- `/workspace/[workspaceId]/insights`

在系统中的角色：

- 数据分析工具页

---

### 4. 协作层

这些能力不建议长期维持为与智慧画布并列的一级主导航。

#### 4.1 Agents

定位：

- 查看 Agent 执行结果
- 展示不同 Agent 的贡献、冲突与建议

建议形态：

- 优先做成智慧画布的侧栏、抽屉或模式页

当前路由：

- `/workspace/[workspaceId]/agents`

长期建议：

- 逐步从独立主页面降级为画布附属能力

#### 4.2 Seminar

定位：

- 汇总不同观点
- 讨论冲突
- 收敛成可执行决策

建议形态：

- 优先做成智慧画布里的会议模式或决策模式

当前路由：

- `/workspace/[workspaceId]/seminar`

长期建议：

- 从并列主入口降级为画布协作模式

---

### 5. 输出层

#### 5.1 跨文化表达

定位：

- 对外表达包装
- 话术调整
- 汇报与跨文化沟通支持

对应路由：

- `/workspace/[workspaceId]/cultural-tools`

#### 5.2 练习

定位：

- 场景模拟
- 沟通演练
- 收集表达反馈

当前路由：

- `/practice`
- `/practice/[scenarioId]`

建议：

- 逐步增加 workspace 语义
- 至少进入时带 `workspaceId`

#### 5.3 社区

定位：

- 分享结果
- 获取反馈
- 复用案例

当前路由：

- `/community`

建议：

- 作为输出与反馈层，而不是主流程步骤

---

## 新的主链路

旧链路偏页面驱动：

`知识库 -> 研究 -> 画布 -> Seminar -> 输出`

新的链路应改成：

`工作区首页 -> 智慧画布 -> 调用工具页补料/分析 -> 回到智慧画布完成建模/决策 -> 输出 -> 反馈回流`

即：

`Home -> Canvas -> Tools -> Canvas -> Delivery -> Feedback -> Canvas`

---

## 反馈闭环

这是当前业务结构里最缺的一层。

新的闭环应该明确：

### 输出结果可以回流到知识库

例如：

- 演练记录
- 会议纪要
- 社区反馈
- 用户纠错

回流为：

- 新证据
- 新案例
- 新知识片段

### 输出结果也可以回流到画布

例如：

- 新风险
- 新冲突
- 被验证失败的假设
- 新行动建议

回流为：

- 节点更新
- 关系调整
- 策略再推演

---

## 新导航结构

建议把当前“阶段导航”改成“工作区导航 + 工具导航”。

### 一级导航

- Workspace Home
- 智慧画布

### 二级导航

- 工具
  - 知识库
  - 深度研究
  - 翻译
  - 数据洞察

- 协作
  - Agents
  - Seminar

- 输出
  - 跨文化表达
  - 练习
  - 社区

---

## 路由建议

### 保持为主入口

- `/workspace/[workspaceId]`
- `/workspace/[workspaceId]/canvas`

### 保持为工具页

- `/workspace/[workspaceId]/knowledge`
- `/workspace/[workspaceId]/deep-research`
- `/workspace/[workspaceId]/translate`
- `/workspace/[workspaceId]/insights`

### 保持但弱化为协作页

- `/workspace/[workspaceId]/agents`
- `/workspace/[workspaceId]/seminar`

### 输出页

- `/workspace/[workspaceId]/cultural-tools`
- `/practice`
- `/practice/[scenarioId]`
- `/community`

### 需要逐步弱化的入口

- `/workspace/[workspaceId]/comfy`

建议：

- 不再作为主导航一级项
- 逐步并入 `/canvas`

---

## 模块职责表

| 模块 | 类型 | 主要职责 | 是否主战场 |
| --- | --- | --- | --- |
| Workspace Home | 概览页 | 恢复工作、看全局状态 | 否 |
| 智慧画布 | 主工作台 | 建模、整合、推演、决策 | 是 |
| 知识库 | 工具页 | 导入资料、沉淀证据 | 否 |
| 深度研究 | 工具页 | 生成研究结论 | 否 |
| 翻译 | 工具页 | 多语预处理 | 否 |
| 数据洞察 | 工具页 | 结构化数据分析 | 否 |
| Agents | 协作页 | Agent 建议与分歧 | 否 |
| Seminar | 协作页 | 观点收敛与决策会 | 否 |
| 跨文化表达 | 输出页 | 对外表达包装 | 否 |
| 练习 | 输出页 | 场景模拟与反馈 | 否 |
| 社区 | 输出页 | 分享与外部反馈 | 否 |

---

## 前端目录层建议

### 路由层

`apps/web/app`

负责：

- URL 结构
- 页面级装配
- 工作区布局

### 业务模块层

`apps/web/src/features`

建议按新业务结构整理为：

- `workspace-home`
- `strategy-canvas`
- `knowledge`
- `research`
- `translation`
- `insights`
- `agents`
- `seminar`
- `delivery`

说明：

- `comfy` 建议逐步重命名或吸收为 `strategy-canvas`
- 不建议长期保留两个平行画布 feature

### 领域数据层

`apps/web/src/entities`

继续负责：

- workspace
- task
- asset
- flow-step

### 共享层

`apps/web/src/shared`

负责：

- 设计系统
- 通用组件
- 工具函数
- 视觉 token

---

## 当前最值得优先修复的 5 个问题

### P1. 画布中心不明确

修复建议：

- 明确 `canvas` 为主工作台
- `comfy` 降级或并入

### P1. 知识库和研究页被当成主链路页面

修复建议：

- 降为工具页
- 导航语义改成“工具箱”

### P1. 协作页与画布并列

修复建议：

- `agents`、`seminar` 逐步变成画布子能力

### P2. 输出页缺工作区语义

修复建议：

- `practice`、`community` 至少增加 workspace 关联

### P2. 缺少反馈回流

修复建议：

- 让练习记录、研讨结果、社区反馈可以回灌知识库和画布

---

## 分阶段重构计划

### 第一阶段

- 保留现有路由
- 先调整导航语义
- 把智慧画布设为推荐入口
- 把知识库、研究、翻译、洞察归类到工具组

### 第二阶段

- 将 `agents`、`seminar` 逐步从一级主页面降级
- 在智慧画布内提供对应面板

### 第三阶段

- 逐步弱化 `/comfy`
- 将其实用能力并入 `/canvas`

### 第四阶段

- 为 `practice`、`community` 增加 workspace 绑定
- 建立结果回流机制

---

## 最终目标

最终前端不再是“很多功能页的集合”。

最终应该是：

- 一个以智慧画布为核心的策略工作台
- 一组为它服务的工具页
- 一组承接结果的输出页
- 一个完整的反馈闭环

也就是：

`Workspace = Canvas-centered operating system`

