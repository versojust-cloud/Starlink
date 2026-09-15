import { expect, test } from '@playwright/test'

type KnowledgeBase = {
  id: string
  workspaceId: string
  name: string
  status: string
  createdAt: string
  updatedAt: string
  publishedAt: string | null
}

type KnowledgeTask = {
  id: string
  workspaceId: string
  kbId: string
  type: 'seed' | 'file' | 'url'
  status: 'pending' | 'processing' | 'succeeded' | 'failed'
  payload: Record<string, unknown>
  error: string | null
  createdAt: string
  updatedAt: string
}

type KbTaskStatus = {
  taskId: string
  workspaceId: string
  kbId: string
  status: 'pending' | 'processing' | 'succeeded' | 'failed'
  taskType: 'seed' | 'file' | 'url'
  error: string | null
  updatedAt: string
  lastEventId: string
}

const graphqlEndpoint = 'http://localhost:4000/graphql'

// FIXME: targets removed `/workspace/[id]/knowledge` task center (deleted
// in 2190dec). Standalone knowledge page now lives at `/knowledge`; the
// in-canvas KB modal handles the upload flow. Rewrite is follow-up.
test.describe.fixme('Knowledge workspace', () => {
  test('@kb-flow supports kb creation and import flow in task center', async ({ page }) => {
    const now = new Date().toISOString()
    const workspaceId = 'demo'
    let idCounter = 1
    let eventCounter = 1

    const knowledgeBases: KnowledgeBase[] = [
      {
        id: 'kb-initial',
        workspaceId,
        name: '初始知识库',
        status: 'draft',
        createdAt: now,
        updatedAt: now,
        publishedAt: null
      }
    ]

    const tasksByKb = new Map<string, KnowledgeTask[]>()
    const snapshotsByKb = new Map<string, KbTaskStatus[]>()

    const ensureKbState = (kbId: string) => {
      if (!tasksByKb.has(kbId)) tasksByKb.set(kbId, [])
      if (!snapshotsByKb.has(kbId)) snapshotsByKb.set(kbId, [])
    }

    const pushTask = (task: KnowledgeTask) => {
      ensureKbState(task.kbId)
      tasksByKb.set(task.kbId, [task, ...(tasksByKb.get(task.kbId) ?? [])])
      snapshotsByKb.set(task.kbId, [
        {
          taskId: task.id,
          workspaceId: task.workspaceId,
          kbId: task.kbId,
          status: task.status,
          taskType: task.type,
          error: task.error,
          updatedAt: task.updatedAt,
          lastEventId: `event-${eventCounter++}`
        },
        ...(snapshotsByKb.get(task.kbId) ?? [])
      ])
    }

    await page.route(graphqlEndpoint, async (route) => {
      const request = route.request()
      const body = request.postDataJSON() as { query?: string; variables?: Record<string, unknown> }
      const query = body?.query ?? ''
      const variables = body?.variables ?? {}

      const fulfillJson = async (data: unknown) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({ data })
        })
      }

      if (query.includes('KnowledgeBases')) {
        await fulfillJson({ knowledgeBases })
        return
      }

      if (query.includes('KnowledgeBaseStatus')) {
        const kbId = String(variables.kbId ?? '')
        ensureKbState(kbId)
        const kb = knowledgeBases.find((item) => item.id === kbId) ?? knowledgeBases[0]
        await fulfillJson({
          knowledgeBaseStatus: {
            knowledgeBase: kb,
            tasks: tasksByKb.get(kb.id) ?? []
          }
        })
        return
      }

      if (query.includes('KbTaskStatus')) {
        const kbId = String(variables.kbId ?? '')
        ensureKbState(kbId)
        await fulfillJson({
          kbTaskStatus: snapshotsByKb.get(kbId) ?? []
        })
        return
      }

      if (query.includes('CreateKnowledgeBase')) {
        const createdAt = new Date().toISOString()
        const kb: KnowledgeBase = {
          id: `kb-${idCounter++}`,
          workspaceId,
          name: '新建 Knowledge Base',
          status: 'draft',
          createdAt,
          updatedAt: createdAt,
          publishedAt: null
        }
        knowledgeBases.unshift(kb)
        ensureKbState(kb.id)
        await fulfillJson({ createKnowledgeBase: kb })
        return
      }

      if (query.includes('AddKnowledgeSeed')) {
        const kbId = String(variables.kbId ?? '')
        const createdAt = new Date().toISOString()
        const task: KnowledgeTask = {
          id: `task-seed-${idCounter++}`,
          workspaceId,
          kbId,
          type: 'seed',
          status: 'pending',
          payload: { length: String(variables.text ?? '').length, seedId: `seed-${idCounter}` },
          error: null,
          createdAt,
          updatedAt: createdAt
        }
        pushTask(task)
        await fulfillJson({ addKnowledgeSeed: task })
        return
      }

      if (query.includes('ImportKnowledgeUrl')) {
        const kbId = String(variables.kbId ?? '')
        const createdAt = new Date().toISOString()
        const task: KnowledgeTask = {
          id: `task-url-${idCounter++}`,
          workspaceId,
          kbId,
          type: 'url',
          status: 'pending',
          payload: { url: String(variables.url ?? '') },
          error: null,
          createdAt,
          updatedAt: createdAt
        }
        pushTask(task)
        await fulfillJson({ importKnowledgeUrl: task })
        return
      }

      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ errors: [{ message: 'Unsupported operation in test' }] })
      })
    })

    await page.route(/http:\/\/localhost:4000\/kb\/.+\/import\/file(?:\?.*)?$/, async (route) => {
      const url = new URL(route.request().url())
      const segments = url.pathname.split('/').filter(Boolean)
      const kbId = segments[1] ?? 'kb-initial'
      ensureKbState(kbId)

      const createdAt = new Date().toISOString()
      const task: KnowledgeTask = {
        id: `task-file-${idCounter++}`,
        workspaceId,
        kbId,
        type: 'file',
        status: 'pending',
        payload: { path: `/tmp/upload-${idCounter}.txt` },
        error: null,
        createdAt,
        updatedAt: createdAt
      }
      pushTask(task)

      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ tasks: [task] })
      })
    })

    await page.goto('/workspace/demo/knowledge')
    await expect(page.getByTestId('knowledge-task-center')).toBeVisible()

    await page.getByTestId('kb-create-button').click()
    await expect(page.getByText('已创建知识库')).toBeVisible()

    await page.getByTestId('kb-seed-textarea').fill('这是一段用于测试的种子文本')
    await page.getByTestId('kb-add-seed-button').click()
    await expect(page.getByText('文本导入任务已创建')).toBeVisible()

    await page.getByTestId('kb-url-input').fill('https://example.com/post')
    await page.getByTestId('kb-import-url-button').click()
    await expect(page.getByText('URL 导入任务已创建')).toBeVisible()

    await page.getByTestId('kb-file-input').setInputFiles({
      name: 'mock.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('mock file content')
    })
    await page.getByTestId('kb-import-file-button').click()
    await expect(page.getByText('文件导入任务已创建 1 个。')).toBeVisible()

    await expect(page.getByTestId('kb-task-card')).toHaveCount(3)
    await expect(page.getByText('#实时').first()).toBeVisible()
  })

  test('@kb-recovery shows failed tasks and recovery state from merged realtime events', async ({ page }) => {
    const baseTime = Date.now()
    const older = new Date(baseTime - 60_000).toISOString()
    const newer = new Date(baseTime - 10_000).toISOString()

    const workspaceId = 'demo'
    const kbId = 'kb-recovery'
    const knowledgeBases: KnowledgeBase[] = [
      {
        id: kbId,
        workspaceId,
        name: '恢复验证库',
        status: 'processing',
        createdAt: older,
        updatedAt: newer,
        publishedAt: null
      }
    ]

    const historyTasks: KnowledgeTask[] = [
      {
        id: 'task-recover-1',
        workspaceId,
        kbId,
        type: 'url',
        status: 'failed',
        payload: { url: 'https://recovered.example.com/article' },
        error: '抓取失败',
        createdAt: older,
        updatedAt: older
      },
      {
        id: 'task-failed-1',
        workspaceId,
        kbId,
        type: 'file',
        status: 'failed',
        payload: { path: '/tmp/broken-file.pdf' },
        error: '文件损坏',
        createdAt: older,
        updatedAt: newer
      }
    ]

    const realtimeStatuses: KbTaskStatus[] = [
      {
        taskId: 'task-recover-1',
        workspaceId,
        kbId,
        status: 'succeeded',
        taskType: 'url',
        error: null,
        updatedAt: newer,
        lastEventId: 'event-recover'
      },
      {
        taskId: 'task-failed-1',
        workspaceId,
        kbId,
        status: 'failed',
        taskType: 'file',
        error: '文件损坏',
        updatedAt: newer,
        lastEventId: 'event-failed'
      }
    ]

    await page.route(graphqlEndpoint, async (route) => {
      const request = route.request()
      const body = request.postDataJSON() as { query?: string; variables?: Record<string, unknown> }
      const query = body?.query ?? ''
      const variables = body?.variables ?? {}

      const fulfillJson = async (data: unknown) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({ data })
        })
      }

      if (query.includes('KnowledgeBases')) {
        await fulfillJson({ knowledgeBases })
        return
      }

      if (query.includes('KnowledgeBaseStatus')) {
        const targetKbId = String(variables.kbId ?? kbId)
        const kb = knowledgeBases.find((item) => item.id === targetKbId) ?? knowledgeBases[0]
        await fulfillJson({
          knowledgeBaseStatus: {
            knowledgeBase: kb,
            tasks: historyTasks
          }
        })
        return
      }

      if (query.includes('KbTaskStatus')) {
        await fulfillJson({ kbTaskStatus: realtimeStatuses })
        return
      }

      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ errors: [{ message: 'Unsupported operation in recovery test' }] })
      })
    })

    await page.goto('/workspace/demo/knowledge')
    await expect(page.getByTestId('knowledge-task-center')).toBeVisible()
    await expect(page.getByTestId('kb-task-card')).toHaveCount(2)

    const recoveredCard = page.getByTestId('kb-task-card').filter({ hasText: 'recovered.example.com' })
    await expect(recoveredCard).toContainText('已完成')
    await expect(recoveredCard).not.toContainText('#error')

    const failedCard = page.getByTestId('kb-task-card').filter({ hasText: 'broken-file.pdf' })
    await expect(failedCard).toContainText('失败')
    await expect(failedCard).toContainText('#error')

    await expect(page.getByText('完成 1').first()).toBeVisible()
    await expect(page.getByText('失败 1').first()).toBeVisible()
  })
})
