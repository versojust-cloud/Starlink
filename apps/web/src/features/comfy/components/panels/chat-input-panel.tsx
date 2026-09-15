'use client'

import { Loader2, Send, Sparkles } from 'lucide-react'
import { useComfyStore } from '../../store'
import { getToolPaletteItems, type ToolDescriptor } from '../../registries/tool-registry'
import { useToolInvoker } from '../tools/use-tool-runner'
import { useComfyShellContext } from '../workspace-shell-context'
import { TOKENS } from '../canvas-design-tokens'

/**
 * Bottom command tray (refresh-2026-04).
 *
 * Refresh notes:
 *  - Emerald-gradient send button → cyan-300 flat (consistent CTA color across
 *    canvas).
 *  - Tool chip row uses single-row segmented chips, wraps on overflow.
 *  - Input border is white/8, focus ring uses cyan token (was emerald).
 *  - Removed "shadow-2xl shadow-black/40" — modal shadow stack was overkill
 *    for a non-floating tray; replaced with subtle inner ring.
 */

export function ChatInputPanel() {
  const { onSendChat } = useComfyShellContext()
  const chatInput = useComfyStore((state) => state.chatInput)
  const setChatInput = useComfyStore((state) => state.setChatInput)
  const isOrchestratorProcessing = useComfyStore((state) => state.isOrchestratorProcessing)
  const setWorkflowStage = useComfyStore((state) => state.setWorkflowStage)
  const openToolDrawer = useComfyStore((state) => state.openToolDrawer)
  const invokeTool = useToolInvoker()
  const tools = getToolPaletteItems()

  const handleSubmit = () => {
    const trimmedInput = chatInput.trim()
    const matchedTool = findCommandTool(trimmedInput, tools)

    if (!matchedTool) {
      onSendChat()
      return
    }

    if (matchedTool.DrawerComponent) {
      openToolDrawer(matchedTool.id)
    }
    const commandText = trimmedInput.slice(matchedTool.command.length).trim()
    if (!commandText && (
      matchedTool.id === 'knowledge'
      || matchedTool.id === 'research'
      || matchedTool.id === 'translate'
    )) {
      return
    }

    void invokeTool(matchedTool, buildCommandInput(matchedTool.id, commandText), {
      summarize: summarizeInlineToolResult
    })
    setChatInput('')
  }

  return (
    <section
      className={`${TOKENS.surface.panel} p-2`}
      style={{ background: 'rgba(2, 6, 23, 0.85)' }}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-1 px-1">
        <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-slate-400">
          <Sparkles className="h-3 w-3 text-cyan-300" strokeWidth={1.75} />
          Canvas Command
        </span>
        {tools.map((tool) => {
          const Icon = tool.icon
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => {
                if (tool.DrawerComponent) {
                  openToolDrawer(tool.id)
                }
                setChatInput(`${tool.command} `)
              }}
              className="inline-flex items-center gap-1 rounded-md border border-white/[0.06] bg-transparent px-2 py-0.5 text-[10px] font-medium text-slate-400 transition-colors hover:border-white/[0.14] hover:bg-white/[0.04] hover:text-slate-200"
              title={tool.description}
            >
              <Icon className="h-3 w-3" />
              {tool.command}
            </button>
          )
        })}
      </div>

      <form
        className={`relative ${TOKENS.surface.input}`}
        onSubmit={(event) => {
          event.preventDefault()
          handleSubmit()
        }}
      >
        <input
          value={chatInput}
          onChange={(event) => {
            const nextValue = event.target.value
            setChatInput(nextValue)
            if (nextValue.trim()) {
              setWorkflowStage('input', 'chat-draft')
            }
          }}
          onKeyUp={(event) => {
            const matchedTool = tools.find(
              (tool) => event.currentTarget.value.trim() === tool.command
            )
            if (event.key === ' ' && matchedTool?.DrawerComponent) {
              openToolDrawer(matchedTool.id)
            }
          }}
          placeholder="询问业务模式，或输入 @ 唤起工具…"
          className="block w-full bg-transparent py-3 pl-4 pr-12 text-[13px] text-slate-100 outline-none placeholder:text-slate-500"
          disabled={isOrchestratorProcessing}
        />
        <button
          type="submit"
          disabled={!chatInput.trim() || isOrchestratorProcessing}
          className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md bg-cyan-400 text-slate-950 transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-cyan-400"
          aria-label="发送"
        >
          {isOrchestratorProcessing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
          ) : (
            <Send className="h-3.5 w-3.5" strokeWidth={2} />
          )}
        </button>
      </form>
    </section>
  )
}

function findCommandTool(input: string, tools: ToolDescriptor[]) {
  return tools.find((tool) => input === tool.command || input.startsWith(`${tool.command} `))
}

function buildCommandInput(toolId: string, commandText: string) {
  if (toolId === 'research') {
    return {
      query: commandText,
      researchType: 'comprehensive',
      depth: 'medium',
      sources: ['academic', 'news'],
      language: 'zh'
    }
  }

  if (toolId === 'knowledge') {
    return {
      query: commandText,
      topK: 5
    }
  }

  if (toolId === 'memory') {
    const normalized = commandText.trim()
    if (!normalized || normalized === 'list' || normalized.startsWith('list ')) {
      return {
        query: normalized.replace(/^list\s*/, ''),
        mode: 'list'
      }
    }

    return {
      query: commandText,
      mode: 'context'
    }
  }

  if (toolId === 'translate') {
    return {
      text: commandText,
      sourceLanguage: 'auto',
      targetLanguage: 'en',
      mode: 'professional'
    }
  }

  return {}
}

function summarizeInlineToolResult(result: unknown) {
  if (isRecord(result) && typeof result.summary === 'string') {
    return result.summary
  }

  if (isRecord(result) && typeof result.translation === 'string') {
    return `已生成翻译：${result.translation.slice(0, 64)}`
  }

  return '工具执行完成'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
