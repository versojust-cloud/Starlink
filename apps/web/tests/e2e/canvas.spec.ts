import { test, expect } from '@playwright/test'

type GraphState = {
  workspaceId: string
  nodes: Array<{
    id: string
    type: string
    position: { x: number; y: number }
    data: Record<string, unknown>
  }>
  edges: Array<{
    id: string
    source: string
    target: string
    label?: string | null
  }>
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

const initialGraph: GraphState = {
  workspaceId: 'demo',
  nodes: [
    {
      id: 'note-1',
      type: 'note',
      position: { x: 80, y: 120 },
      data: {
        type: 'note',
        title: '任务规划',
        subtitle: '我们如何完成 AI Agent 调研？',
        content: '我想要完成 AI Agent 调研',
        variant: 'primary',
        footerText: '复杂的办公任务，从规划开始'
      }
    },
    {
      id: 'doc-1',
      type: 'note',
      position: { x: 500, y: 120 },
      data: {
        type: 'note',
        title: '第 1 轮 · 澄清问题',
        subtitle: 'AI Agent 调研',
        content: '我们先确认任务目标、聚焦行业与时限等关键信息。',
        bullets: [
          '调研的核心目标是什么？（如技术原理分析/应用场景研究/竞品对比/市场趋势预测）',
          '需要聚焦哪些具体领域或行业？（如医疗/金融/教育/制造业等）',
          '是否有特定的时间范围或数据来源要求？'
        ],
        variant: 'timeline-step'
      }
    },
    {
      id: 'doc-2',
      type: 'note',
      position: { x: 760, y: 120 },
      data: {
        type: 'note',
        title: '客户与市场机会',
        subtitle: '商业模式板块',
        content: '目标客户：中大型企业知识团队；市场规模持续增长。',
        bullets: ['痛点：知识更新慢、协同效率低', '动机：提升效率与合规保障'],
        variant: 'timeline-dimension'
      }
    },
    {
      id: 'doc-3',
      type: 'note',
      position: { x: 1020, y: 120 },
      data: {
        type: 'note',
        title: '行动计划',
        subtitle: '第 1 轮',
        bullets: [
          '访谈 5 家重点客户，补齐需求清单',
          '梳理价值主张与差异点，形成初步模型',
          '设计收入与定价假设，准备下一轮验证'
        ],
        variant: 'timeline-action'
      }
    }
  ],
  edges: [
    {
      id: 'note-1->doc-1',
      source: 'note-1',
      target: 'doc-1',
      label: '步骤 1'
    },
    {
      id: 'doc-1->doc-2',
      source: 'doc-1',
      target: 'doc-2',
      label: '步骤 1.1'
    },
    {
      id: 'doc-2->doc-3',
      source: 'doc-2',
      target: 'doc-3',
      label: '行动计划'
    }
  ]
}

const graphqlEndpoint = 'http://localhost:4000/graphql'

// FIXME: targets removed `/workspace/[id]/canvas` route (deleted in 2190dec).
// Standalone canvas now lives at `/canvas/[workspaceId]`; rewriting these
// against the new shell is follow-up work.
test.describe.fixme('Canvas workspace', () => {
  test.beforeEach(async ({ page }) => {
    let graph = clone(initialGraph)

    await page.route(graphqlEndpoint, async (route) => {
      const request = route.request()
      const body = request.postDataJSON() as { query: string; variables: Record<string, any> }
      if (!body?.query) {
        await route.continue()
        return
      }

      if (body.query.includes('WorkspaceGraph')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { workspaceGraph: graph } })
        })
        return
      }

      if (body.query.includes('AddNode')) {
        const { input } = body.variables ?? {}
        const newNodeId = `node-${Date.now()}`
        const newNode = {
          id: newNodeId,
          type: input.type,
          position: input.position,
          data: input.data
        }
        graph = {
          ...graph,
          nodes: [...graph.nodes, newNode]
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { addNode: newNode } })
        })
        return
      }

      if (body.query.includes('ConnectNodes')) {
        const { input } = body.variables ?? {}
        const newEdge = {
          id: `${input.source}->${input.target}`,
          source: input.source,
          target: input.target,
          label: input.label ?? null
        }
        graph = {
          ...graph,
          edges: [...graph.edges, newEdge]
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { connectNodes: newEdge } })
        })
        return
      }

      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ errors: [{ message: 'Unsupported operation' }] })
      })
    })
  })

  test('allows dragging a note node onto the canvas', async ({ page }) => {
    await page.goto('/workspace/demo')
    await expect(page.getByText('任务规划')).toBeVisible()

    const paletteNote = page.getByTestId('palette-item-note')
    const canvas = page.getByTestId('canvas-area')
    await paletteNote.dragTo(canvas, { targetPosition: { x: 300, y: 260 } })

    await expect(page.getByText('新建笔记')).toBeVisible()
  })

  test('toggles assistant and document panels via toolbar', async ({ page }) => {
    await page.goto('/workspace/demo')
    await expect(page.getByTestId('assistant-panel')).toBeVisible()
    await expect(page.getByTestId('document-drawer')).toBeVisible()

    await page.getByRole('button', { name: '助手' }).click()
    await expect(page.getByTestId('assistant-panel')).toBeHidden()

    await page.getByRole('button', { name: '文档抽屉' }).click()
    await expect(page.getByTestId('document-drawer')).toBeHidden()
  })
})

// FIXME: same as above — targets `/workspace/[id]` route removed in 2190dec.
test.describe.fixme('Canvas error handling', () => {
  test('shows error state and allows retry on graph load failure', async ({ page }) => {
    let requestCount = 0

    await page.route(graphqlEndpoint, async (route) => {
      const request = route.request()
      const body = request.postDataJSON() as { query: string; variables: Record<string, any> }
      if (!body?.query) {
        await route.continue()
        return
      }

      if (body.query.includes('WorkspaceGraph')) {
        requestCount += 1
        if (requestCount === 1) {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ errors: [{ message: 'Internal error' }] })
          })
          return
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { workspaceGraph: initialGraph } })
        })
        return
      }

      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ errors: [{ message: 'Unsupported operation' }] })
      })
    })

    await page.goto('/workspace/demo')
    await expect(page.getByTestId('canvas-error')).toBeVisible()

    await page.getByRole('button', { name: '重试' }).click()
    await expect(page.getByText('任务规划')).toBeVisible()
  })
})
