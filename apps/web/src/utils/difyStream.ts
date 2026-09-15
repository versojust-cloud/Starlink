export type DifyStreamEvent =
  | { type: 'message'; data: unknown }
  | { type: 'token'; data: string }
  | { type: 'heartbeat' }
  | { type: 'completed'; data?: unknown }
  | { type: 'error'; error: Error }

type StreamHandlers = {
  onEvent?: (event: DifyStreamEvent) => void
  signal?: AbortSignal
}

/**
 * 将 Dify 返回的流式 Response 解析为事件流。Dify 使用 SSE 风格，
 * 每个数据包形如 "event:message\ndata:{...}\n\n"。
 */
export async function consumeDifyStream(response: Response, handlers: StreamHandlers = {}): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader) {
    handlers.onEvent?.({
      type: 'error',
      error: new Error('Stream response has no body')
    })
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''

  const abort = () => {
    try {
      reader.cancel().catch(() => {})
    } catch {
      // ignore
    }
  }

  handlers.signal?.addEventListener('abort', abort, { once: true })

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const chunk = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        handleChunk(chunk, handlers.onEvent)
        boundary = buffer.indexOf('\n\n')
      }
    }
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      handlers.onEvent?.({
        type: 'error',
        error: error instanceof Error ? error : new Error(String(error))
      })
    }
  } finally {
    handlers.onEvent?.({ type: 'completed' })
    handlers.signal?.removeEventListener('abort', abort)
  }
}

function handleChunk(chunk: string, emit?: (event: DifyStreamEvent) => void) {
  if (!emit) return

  let eventType: string | null = null
  let dataPayload = ''

  for (const line of chunk.split('\n')) {
    if (line.startsWith('event:')) {
      eventType = line.slice('event:'.length).trim()
    } else if (line.startsWith('data:')) {
      dataPayload += `${line.slice('data:'.length).trim()}\n`
    }
  }

  const trimmedData = dataPayload.trim()

  switch (eventType) {
    case 'ping':
      emit({ type: 'heartbeat' })
      return
    case 'message':
      emit({ type: 'message', data: parseJsonSafe(trimmedData) ?? trimmedData })
      return
    case 'token':
      emit({ type: 'token', data: trimmedData })
      return
    case 'completed':
      emit({ type: 'completed', data: parseJsonSafe(trimmedData) ?? trimmedData })
      return
    case 'error':
      emit({
        type: 'error',
        error: new Error(trimmedData || 'Dify stream error')
      })
      return
    default:
      if (trimmedData) {
        emit({ type: 'message', data: parseJsonSafe(trimmedData) ?? trimmedData })
      }
  }
}

function parseJsonSafe(input: string) {
  if (!input) return null
  try {
    return JSON.parse(input)
  } catch {
    return null
  }
}
