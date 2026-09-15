export type DifyWorkflowMode = 'blocking' | 'streaming'
export type DifyPriority = 'low' | 'normal' | 'high'
export type DifyRateLimitIdentifier = 'user' | 'tenant' | 'workflow' | 'ip'

export type DifyRateLimitRule = {
  identifier: DifyRateLimitIdentifier
  intervalMs: number
  limit: number
}

export type DifyQuotaPlan = {
  daily?: number
  monthly?: number
}

export type DifyFallbackPlan = {
  workflowId?: string
  message?: string
}

export type DifyWorkflowConfig = {
  id: string
  appId: string
  apiKey: string
  mode: DifyWorkflowMode
  baseUrl?: string
  description?: string
  tenantId?: string
  tags?: string[]
  quota?: DifyQuotaPlan
  fallback?: DifyFallbackPlan
  rateLimit?: DifyRateLimitRule[]
  defaultPriority?: DifyPriority
  metricsTag?: string
  auditChannel?: string
  metadata?: Record<string, string>
}

export type DifyRetryConfig = {
  attempts: number
  delayMs?: number
}

export type DifyWorkflowExecutionRequest = {
  workflowId: string
  inputs: Record<string, unknown>
  userId?: string
  mode?: DifyWorkflowMode
  stream?: boolean
  priority?: DifyPriority
  metricsTag?: string
  extra?: Record<string, unknown>
  retry?: DifyRetryConfig
}

export type DifyBlockingResponse = {
  answer?: string
  data?: unknown
  outputs?: Array<{ text?: string; answer?: string }>
  usage?: { total_tokens?: number }
  [key: string]: unknown
}

export class DifyRequestError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly detail?: string,
    readonly requestId?: string
  ) {
    super(`Dify request failed (${status} ${statusText}): ${detail ?? 'no detail'}`)
    this.name = 'DifyRequestError'
  }
}

export type DifyClientOptions = {
  baseUrl: string
  apiKey: string
  appId?: string
  fetchImpl?: typeof fetch
}

export type RunWorkflowOptions = {
  inputs: Record<string, unknown>
  responseMode?: DifyWorkflowMode
  user?: string
  priority?: DifyPriority
  metricsTag?: string
  extra?: Record<string, unknown>
  signal?: AbortSignal
}

export class DifyClient {
  private readonly fetchImpl: typeof fetch

  constructor(private readonly options: DifyClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async runWorkflow(options: RunWorkflowOptions): Promise<DifyBlockingResponse | Response> {
    const responseMode = options.responseMode ?? 'blocking'
    const response = await this.fetchImpl(this.resolveUrl('/workflows/run'), {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({
        workflow_id: this.options.appId,
        response_mode: responseMode,
        user: options.user,
        inputs: options.inputs,
        metadata: this.createMetadata(options),
        ...options.extra
      }),
      signal: options.signal
    } satisfies RequestInit)

    if (!response.ok) {
      const detail = await readErrorDetail(response)
      throw new DifyRequestError(
        response.status,
        response.statusText,
        detail,
        response.headers.get('x-request-id') ?? undefined
      )
    }

    if (responseMode === 'streaming') {
      return response
    }

    return (await response.json()) as DifyBlockingResponse
  }

  private resolveUrl(path: string): string {
    return `${this.options.baseUrl.replace(/\/$/, '')}${path}`
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.options.apiKey}`
    }

    if (this.options.appId) {
      headers['x-app-id'] = this.options.appId
    }

    return headers
  }

  private createMetadata(options: RunWorkflowOptions) {
    const metadata: Record<string, string> = {}
    if (options.priority) {
      metadata.priority = options.priority
    }
    if (options.metricsTag) {
      metadata.metricsTag = options.metricsTag
    }
    return Object.keys(metadata).length > 0 ? metadata : undefined
  }
}

async function readErrorDetail(response: Response): Promise<string | undefined> {
  const raw = await safeReadText(response)
  if (!raw) return undefined
  try {
    const json = JSON.parse(raw) as { error?: { message?: string }; message?: string }
    return json.error?.message ?? json.message ?? raw
  } catch {
    return raw
  }
}

async function safeReadText(response: Response) {
  try {
    return await response.text()
  } catch {
    return undefined
  }
}
