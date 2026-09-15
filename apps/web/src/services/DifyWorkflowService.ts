import { consumeDifyStream, type DifyStreamEvent } from '../utils/difyStream'

export type ExecuteWorkflowParams = {
  workflowId: string
  inputs: Record<string, unknown>
  userId?: string
  mode?: 'blocking' | 'streaming'
  fetchImpl?: typeof fetch
  signal?: AbortSignal
  onEvent?: (event: DifyStreamEvent) => void
}

const DEFAULT_ENDPOINT = '/api/dify'

export class DifyWorkflowService {
  constructor(private readonly endpoint = DEFAULT_ENDPOINT) {}

  async executeWorkflow<T = unknown>(params: ExecuteWorkflowParams): Promise<T | void> {
    const fetcher = params.fetchImpl ?? fetch
    const response = await fetcher(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        workflowId: params.workflowId,
        inputs: params.inputs,
        userId: params.userId,
        mode: params.mode,
        stream: params.mode === 'streaming'
      }),
      signal: params.signal
    })

    if (!response.ok) {
      const detail = await safeReadText(response)
      throw new Error(detail || `Dify workflow failed with status ${response.status}`)
    }

    if (params.mode === 'streaming') {
      await consumeDifyStream(response, {
        onEvent: params.onEvent,
        signal: params.signal
      })
      return
    }

    return (await response.json()) as T
  }
}

async function safeReadText(response: Response) {
  try {
    return await response.text()
  } catch {
    return null
  }
}
