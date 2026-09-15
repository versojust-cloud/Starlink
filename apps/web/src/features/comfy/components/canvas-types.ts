export type CanvasChatMessage = {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export type ComfyChatMessage = CanvasChatMessage
