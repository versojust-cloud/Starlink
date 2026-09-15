'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Node, Edge } from 'reactflow'
import { useComfyStore } from '../store'
import { buildConflictEdges } from '../store/build-conflict-edges'
import { CCBMCDetailDrawer } from './cc-bmc-detail-drawer'
import { ReportDetailDrawer } from './report-detail-drawer'
import { CanvasHeader } from './canvas-header'
import { CanvasFlow } from './canvas'
import { CanvasTutorialDialog } from './canvas-tutorial-dialog'
import { CanvasPerspectiveToggle } from './canvas-perspective-toggle'
import { CanvasChatDock } from './canvas-chat-dock'
import { CanvasCitationPanel } from './canvas-citation-panel'
import { AgentHealthChip } from './agent-health-chip'
import { MemoryDrawer } from './memory-drawer'
import { CanvasWizardPanel } from './canvas-wizard-panel'
import { CanvasLiveCoach } from './canvas-live-coach'
import { SubAgentWireWidget } from './sub-agent-wire-widget'
import { CanvasHitlBanner } from './canvas-hitl-banner'
import { CanvasPromptDialog } from './canvas-prompt-dialog'
import { CanvasThinkingOverlay } from './canvas-thinking-overlay'
import { EvidenceDrawer } from './evidence-drawer'
import { KbUploadModal } from './kb-upload-modal'
import { CanvasStageStrip } from './canvas-stage-strip'
import { WorkspaceShell } from './workspace-shell'
import type { PendingDecisionRequest } from './workspace-shell-context'
import './panels/register-default-panels'
import { useCitationHighlight } from '../hooks/use-citation-highlight'
import { useConversationRuntime } from '@/features/workspace/hooks'
import { BmcGrid } from '@/features/macra/components/BmcGrid'
import type { MacraNodeData } from '@/types/macra'
import { LayoutGrid, PanelsTopLeft } from 'lucide-react'

type CanvasPageProps = {
  workspaceId?: string
  /**
   * When true, render the canvas full-viewport WITHOUT WorkspaceShell's
   * left/right panel rails. The CanvasHeader still sits on top and the
   * canvas occupies all remaining space. Used by the (standalone)
   * /canvas/[workspaceId] route — gives the user a chromeless work
   * surface for demos / focused editing without the input panel,
   * node library, knowledge sidebar etc.
   *
   * Defaults to false so /workspace/[id]/canvas (the existing route
   * inside the (app) shell) keeps its current full UI.
   */
  standalone?: boolean
}

const CANVAS_TUTORIAL_STORAGE_KEY = 'canvas_tutorial_seen'
const LEGACY_TUTORIAL_STORAGE_KEY = 'comfy_tutorial_seen'

export function CanvasPage({
  workspaceId = 'canvas-default',
  standalone = false,
}: CanvasPageProps) {
  const nodes = useComfyStore((state) => state.nodes)
  const edges = useComfyStore((state) => state.edges)
  const onNodesChange = useComfyStore((state) => state.onNodesChange)
  const onEdgesChange = useComfyStore((state) => state.onEdgesChange)
  const onConnect = useComfyStore((state) => state.onConnect)
  const setNodes = useComfyStore((state) => state.setNodes)
  const callLangGraph = useComfyStore((state) => state.callLangGraph)
  const isOrchestratorProcessing = useComfyStore((state) => state.isOrchestratorProcessing)
  const callCritic = useComfyStore((state) => state.callCritic)
  const setWorkspaceId = useComfyStore((state) => state.setWorkspaceId)
  const appendChatMessage = useComfyStore((state) => state.appendChatMessage)
  const approveDecision = useComfyStore((state) => state.approveDecision)
  const macraNodes = useComfyStore((state) => state.macraNodes)
  const openDetailPanel = useComfyStore((state) => state.openDetailPanel)
  const workflowStage = useComfyStore((state) => state.workflowStage)
  const setWorkflowStage = useComfyStore((state) => state.setWorkflowStage)
  const exportCanvasJson = useComfyStore((state) => state.exportCanvasJson)
  const importCanvasJson = useComfyStore((state) => state.importCanvasJson)
  const reattachToActiveSession = useComfyStore((state) => state.reattachToActiveSession)

  const handleExportCanvas = useCallback((): void => {
    // P12 fix M2 · empty canvas warning. Exporting an empty BMC produces
    // a JSON file with no nodes — useless on import. Tell the user
    // before generating the download. Without this the click was silent
    // and users assumed the button was broken.
    const { nodes: storeNodes } = useComfyStore.getState()
    if (storeNodes.length === 0) {
      useComfyStore.getState().appendChatMessage({
        role: 'assistant',
        content: '⚠ 画布为空，无内容可导出。先用 7 步向导或 @-mention agent 生成 BMC 节点后再导出。',
        source: 'scripted'
      })
      setChatOpen(true)
      return
    }
    const json = exportCanvasJson()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    link.href = url
    link.download = `canvas-${workspaceId}-${stamp}.json`
    link.click()
    URL.revokeObjectURL(url)
    useComfyStore.getState().appendChatMessage({
      role: 'assistant',
      content: `✓ 已导出 canvas-${workspaceId}-${stamp}.json（${storeNodes.length} 个节点）。`,
      source: 'scripted'
    })
  }, [exportCanvasJson, workspaceId])

  const handleImportCanvas = useCallback(
    async (file: File): Promise<void> => {
      try {
        const text = await file.text()
        importCanvasJson(text)
      } catch (err) {
        // Surface to the user — bad JSON / wrong version / missing fields
        // shouldn't silently corrupt the canvas.
        const message = err instanceof Error ? err.message : String(err)
        if (typeof window !== 'undefined') window.alert(`画布导入失败：${message}`)
      }
    },
    [importCanvasJson]
  )

  const runtime = useConversationRuntime(workspaceId)
  const [viewMode, setViewMode] = useState<'freeform' | 'bmc'>('freeform')

  // Citation highlight: Esc 键清除反向高亮 + 卡片高亮 className derivation
  useCitationHighlight()

  // 检测 HITL 决策请求
  const pendingDecisionRequest = useMemo(() => {
    const requests = runtime.events.filter(
      (e): e is Extract<typeof e, { type: 'seminar.decision.requested' }> =>
        e.type === 'seminar.decision.requested'
    )
    const decisions = runtime.events.filter(
      (e) => e.type === 'seminar.decision.made'
    )
    // 只显示最新的未响应的决策请求
    if (requests.length > decisions.length) {
      return requests[requests.length - 1]
    }
    return null
  }, [runtime.events])

  const [hitlInput, setHitlInput] = useState('')

  const [seedInput, setSeedInput] = useState('')
  const [showTutorial, setShowTutorial] = useState(false)
  const [tutorialStep, setTutorialStep] = useState(0)
  const [isAnimating, setIsAnimating] = useState(true)
  const [showPromptDialog, setShowPromptDialog] = useState(false)
  // Default both side panels CLOSED so the canvas is the visual focus on
  // entry. User clicks the floating chat / book icon to expand. Avoids
  // a "panels eat 680/800px → ReactFlow fitView shrinks nodes to 14%
  // scale → user sees an empty canvas" misperception.
  const [chatOpen, setChatOpen] = useState(false)
  const [citationOpen, setCitationOpen] = useState(false)
  const [kbModalOpen, setKbModalOpen] = useState(false)
  const [memoryOpen, setMemoryOpen] = useState(false)
  // Inline AI wizard — auto-opens when URL has ?wizard=1 (link from /chat
  // home CTA). Manual toggle available via "AI 引导" button on left rail.
  //
  // Bug history: previously this useState initializer read window.location
  // directly, which returned different values on server (undefined window
  // → false) vs client (URL has ?wizard=1 → true). That caused a Next.js
  // hydration mismatch on <aside> when wizard was open. Fix: always start
  // false, then sync from URL inside useEffect (client-only).
  const [wizardOpen, setWizardOpen] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (new URLSearchParams(window.location.search).get('wizard') === '1') {
      setWizardOpen(true)
    }
  }, [])
  // Conflict highlight is now driven by the store's focusedConflictId so
  // both the canvas (edge click) and the renderer chips
  // ([[critic:conflictId]] in report-writer output) can request the same
  // panel-state change. Reading from the store also keeps this state
  // available across drawer re-mounts.
  const focusedConflictId = useComfyStore((s) => s.focusedConflictId)
  const setFocusedConflictId = useComfyStore((s) => s.setFocusedConflictId)
  // Whenever a chip / edge sets a conflict id, auto-open the citation panel.
  // P8 anti-overlap: at narrow viewports (< 1100px) chat + citation panels
  // collide horizontally — open one, close the other.
  useEffect(() => {
    if (focusedConflictId) {
      setCitationOpen(true)
      if (typeof window !== 'undefined' && window.innerWidth < 1100) {
        setChatOpen(false)
      }
    }
  }, [focusedConflictId])
  const structuredNodes = useMemo(
    () =>
      Array.from(macraNodes.values()).filter((node): node is MacraNodeData =>
        typeof node.domain === 'string' && node.type === 'cc-bmc-card'
      ),
    [macraNodes]
  )
  const conflictAlertCount = useMemo(
    () => Array.from(macraNodes.values()).filter((node) => node.type === 'conflict-alert').length,
    [macraNodes]
  )

  // Hide conflict-alert nodes from canvas — they're rendered as edges instead.
  const nodesWithoutConflicts = useMemo(
    () => nodes.filter((n) => !n.id?.startsWith('conflict-')),
    [nodes]
  )

  // Detail-drawer routing: BMC nodes get CCBMCDetailDrawer (with quiz / edit / etc tabs);
  // report-card nodes get the dedicated ReportDetailDrawer (TOC + sections, no tabs).
  // Other types fall through to BMC drawer (which gracefully degrades).
  const detailNodeId = useComfyStore((state) => state.detailPanel?.nodeId)
  const focusedDrawerKind = useMemo<'report' | 'bmc'>(() => {
    if (!detailNodeId) return 'bmc'
    const node = macraNodes.get(detailNodeId)
    return node?.type === 'report-card' ? 'report' : 'bmc'
  }, [detailNodeId, macraNodes])

  // Augment edges with synthetic conflict edges (red dashed) connecting
  // each conflict's BMC cell pair. Use the conflictType / relatedAgents
  // mapping from buildConflictEdges. presentNodeIds gates against
  // missing cells so we never produce dangling edges.
  const edgesWithConflicts = useMemo<Edge[]>(() => {
    const presentIds = new Set(nodesWithoutConflicts.map((n) => n.id))
    const conflictEdges = buildConflictEdges(macraNodes, presentIds)
    return [...edges, ...conflictEdges]
  }, [edges, macraNodes, nodesWithoutConflicts])

  // Click a conflict edge → open Insight Panel + switch to 审查 tab +
  // auto-expand that conflict for inline detail reading.
  const handleEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      const data = edge.data as { conflictId?: string } | undefined
      if (!data?.conflictId) return
      setFocusedConflictId(data.conflictId)
      // useEffect above will open the panel
    },
    [setFocusedConflictId]
  )

  useEffect(() => {
    const timer = setTimeout(() => setIsAnimating(false), 1200)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    setWorkspaceId(workspaceId)
  }, [setWorkspaceId, workspaceId])

  // Sprint 1.4 · Active-session reconnect.
  // If a previous tab kicked off a pipeline that is still running on the
  // server (e.g. the user navigated away mid-run, or refreshed), this
  // probes for a live ConversationSession on mount and re-subscribes
  // to its progress stream. Idempotent — silently no-ops when nothing
  // is running. Runs once per workspaceId change.
  useEffect(() => {
    if (!workspaceId) return
    let cancelled = false
    void reattachToActiveSession(workspaceId).then((conversationId) => {
      if (cancelled) return
      if (conversationId) {
        console.info(`[canvas] reattached to running session ${conversationId}`)
      }
    })
    return () => {
      cancelled = true
    }
  }, [reattachToActiveSession, workspaceId])

  useEffect(() => {
    if (pendingDecisionRequest) {
      setWorkflowStage('review', 'decision-requested')
      return
    }

    if (!isOrchestratorProcessing && (workflowStage === 'thinking' || workflowStage === 'revising')) {
      setWorkflowStage(nodes.length > 0 ? 'output' : 'idle', nodes.length > 0 ? 'analysis-finished' : 'analysis-cleared')
    }
  }, [isOrchestratorProcessing, nodes.length, pendingDecisionRequest, setWorkflowStage, workflowStage])

  useEffect(() => {
    const hasSeenTutorial =
      localStorage.getItem(CANVAS_TUTORIAL_STORAGE_KEY) ??
      localStorage.getItem(LEGACY_TUTORIAL_STORAGE_KEY)
    if (!hasSeenTutorial && nodes.length === 0) {
      setShowTutorial(true)
    }
  }, [nodes.length])

  const handleCloseTutorial = useCallback(() => {
    setShowTutorial(false)
    localStorage.setItem(CANVAS_TUTORIAL_STORAGE_KEY, 'true')
  }, [])

  const handleNextStep = useCallback(() => {
    if (tutorialStep < 2) {
      setTutorialStep((currentStep) => currentStep + 1)
      return
    }
    handleCloseTutorial()
  }, [handleCloseTutorial, tutorialStep])

  const addNode = useCallback(
    (type: string) => {
      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type,
        position: {
          x: Math.random() * 400 + 300,
          y: Math.random() * 400 + 200,
        },
        data: { label: `${type} node` },
      }
      setNodes((previousNodes) => [...previousNodes, newNode])
    },
    [setNodes]
  )

  const handleSeedInputChange = useCallback((value: string) => {
    setSeedInput(value)
    if (value.trim()) {
      setWorkflowStage('input', 'seed-draft')
      return
    }

    if (nodes.length === 0 && !isOrchestratorProcessing) {
      setWorkflowStage('idle', 'seed-cleared')
    }
  }, [isOrchestratorProcessing, nodes.length, setWorkflowStage])

  const handleSeedGeneration = useCallback(async () => {
    if (!seedInput.trim() || isOrchestratorProcessing) return

    appendChatMessage({ role: 'user', content: seedInput })

    try {
      await callLangGraph(seedInput, 'seed')
      appendChatMessage({
        role: 'assistant',
        content: `已为你生成基于"${seedInput}"的初始画布。继续对话来完善它。`,
      })
      setSeedInput('')
    } catch (error) {
      console.error('种子生成失败:', error)
      appendChatMessage({
        role: 'assistant',
        content: '抱歉，AI 生成失败，请稍后再试。',
      })
    }
  }, [appendChatMessage, callLangGraph, isOrchestratorProcessing, seedInput])

  const handlePromptSubmit = useCallback(
    async (seed: string) => {
      if (isOrchestratorProcessing) return
      setShowPromptDialog(false)
      appendChatMessage({ role: 'user', content: seed })
      try {
        await callLangGraph(seed, 'seed')
        appendChatMessage({
          role: 'assistant',
          content: `已为你生成基于"${seed}"的初始画布。继续对话来完善它。`,
        })
      } catch (error) {
        console.error('种子生成失败:', error)
        appendChatMessage({
          role: 'assistant',
          content: '抱歉，AI 生成失败，请稍后再试。',
        })
      }
    },
    [appendChatMessage, callLangGraph, isOrchestratorProcessing]
  )

  // Resume hydration: when user lands on /canvas/<conversationId> from
  // /chat homepage (or via rail click), pull the existing conversation's
  // graph + evidence from server so the canvas paints immediately. If
  // the URL param turns out NOT to be a conversation (e.g. legacy
  // /canvas/proj-001 path), the hydrate returns null and we keep the
  // fresh-canvas behaviour. Standalone-only — the shell route runs its
  // own seed flow via WorkspaceShell.
  const hydrateFromConversation = useComfyStore((state) => state.hydrateFromConversation)
  const reflectOnChatStore = useComfyStore((state) => state.reflectOnChat)
  const setStoreChatInput = useComfyStore((state) => state.setChatInput)
  const [hydrateAttempted, setHydrateAttempted] = useState(false)
  useEffect(() => {
    if (!standalone || hydrateAttempted) return
    setHydrateAttempted(true)
    ;(async () => {
      await hydrateFromConversation(workspaceId).catch(() => null)
      // Phase 1 (Socratic exploration) trigger: if /chat homepage
      // stashed a seed in sessionStorage, fire ONE coach reflection on
      // it now. The user message gets appended to chat (handled inside
      // reflectOnChat), and the coach replies with a why/how/so-what
      // question. The agent BMC pipeline does NOT fire here — that's
      // what AI Synthesis button is for once user is ready to graduate.
      if (typeof window === 'undefined') return
      const pendingSeed = window.sessionStorage.getItem('starlink_pending_seed')
      if (pendingSeed && pendingSeed.trim()) {
        window.sessionStorage.removeItem('starlink_pending_seed')
        setChatOpen(true)
        // Pre-fill seed input so AI Synthesis prompt dialog shows it
        // when the user is ready to generate the BMC.
        setSeedInput(pendingSeed)
        setStoreChatInput('')
        await reflectOnChatStore(pendingSeed).catch((err) => {
          console.warn('[canvas] initial Socratic reflect failed', err)
        })
      }

      // Mode B path: ?kb=<id> from /knowledge — directly fire BMC pipeline
      // with KB as RAG source. Bypasses Socratic exploration since the
      // user has already curated their materials.
      const url = new URL(window.location.href)
      const kbParam = url.searchParams.get('kb')
      if (kbParam) {
        url.searchParams.delete('kb')
        window.history.replaceState({}, '', url.toString())
        const langGraph = useComfyStore.getState().callLangGraph
        await langGraph(
          '基于已上传的资料生成 BMC 商业画布，使用 RAG 检索关键证据',
          'seed',
          kbParam
        ).catch((err) => console.warn('[canvas] kb auto-trigger failed', err))
      }
    })()
  }, [standalone, hydrateAttempted, workspaceId, hydrateFromConversation, reflectOnChatStore, setStoreChatInput])

  // Chat dock send goes through the Socratic coach (reflectOnIdeation),
  // NOT the BMC generator pipeline. The coach reads current canvas state
  // and recent chat history, returns one scaffold-typed reflective
  // question (why / how / so_what / evidence_needed / meta). To trigger
  // the BMC generator instead, use AI Synthesis in the action bar →
  // CanvasPromptDialog (which routes to callLangGraph).
  const reflectOnChat = useComfyStore((state) => state.reflectOnChat)
  const handleSendChat = useCallback(async () => {
    const {
      chatInput,
      chatReflecting,
      mentionAgent: mention,
      setChatInput,
      setChatMessages,
      wizardChat,
      startWizardInChat,
      endWizardInChat,
      submitWizardChatAnswer
    } = useComfyStore.getState()
    const trimmed = chatInput.trim()
    if (!trimmed || isOrchestratorProcessing || chatReflecting) return

    // Slash commands (2026-05-04). Intercepted before mention parsing.
    //   /clear   — clear chat history (keeps welcome bubble)
    //   /agents  — print all 11 agents with their @-ids and shortDescription
    //   /wizard  — start the in-chat 7-step structured wizard
    //   /cancel  — exit the wizard mid-flow
    if (trimmed.startsWith('/')) {
      const cmd = trimmed.slice(1).split(/\s+/)[0]?.toLowerCase()
      if (cmd === 'wizard') {
        setChatInput('')
        // Sprint 1.2 · pass workspaceId so the wizard can pre-read KB.
        // The store's startWizardInChat handles GraphQL prefill internally
        // and falls back gracefully if no KB exists.
        await startWizardInChat(workspaceId, true)
        return
      }
      if (cmd === 'cancel' && wizardChat.active) {
        setChatInput('')
        endWizardInChat()
        return
      }
      if (cmd === 'clear') {
        setChatInput('')
        setChatMessages([
          {
            role: 'assistant',
            content: '对话已清空。继续提问或 @ 唤起 agent。',
            timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
            source: 'scripted'
          }
        ])
        return
      }
      if (cmd === 'agents') {
        setChatInput('')
        // Lazy import to keep this resolver light. listAgents() returns
        // descriptors in stable order — same as @ popup.
        const { listAgents } = await import('../registries/agent-registry')
        const lines = listAgents().map(a => `- **@${a.id}** (${a.displayName}) — ${a.shortDescription}`).join('\n')
        setChatMessages([
          ...useComfyStore.getState().chatMessages,
          {
            role: 'user',
            content: '/agents',
            timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
          },
          {
            role: 'assistant',
            content: `## 当前可用的 11 个 agent\n\n${lines}\n\n用 \`@<id> 你的问题\` 唤起其中之一。`,
            timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
            source: 'scripted'
          }
        ])
        return
      }
      // Unknown command — fall through and let it look like a message.
    }

    // Wizard mode: regular chat input → wizard answer pipeline.
    // We intercept BEFORE @-mention so accidental @ inside an answer
    // doesn't break the wizard flow.
    if (wizardChat.active) {
      setChatInput('')
      await submitWizardChatAnswer(workspaceId, trimmed)
      return
    }

    // @-mention path: if the message starts with `@<agent-id> <body>`,
    // route directly to the agent via mentionAgent (no Socratic coach,
    // no BMC pipeline). Pattern: id can contain alphanumerics + dashes.
    const mentionMatch = trimmed.match(/^@([a-z][a-z0-9-]+)\s+([\s\S]+)$/i)
    if (mentionMatch) {
      const [, agentId, body] = mentionMatch
      setChatInput('')
      try {
        await mention(agentId, body)
      } catch (error) {
        console.error('@-mention 失败:', error)
      }
      return
    }

    await reflectOnChat(chatInput)
  }, [reflectOnChat, isOrchestratorProcessing, workspaceId])

  // Mode A graduation — user clicks the meta-check CTA after AI deems
  // the conversation has explored enough dimensions. Stitches the seed
  // (original /chat input) + last 12 chat turns into a single BMC seed
  // and fires the 8-agent pipeline.
  const handleGraduateToBmc = useCallback(async () => {
    if (isOrchestratorProcessing) return
    const { chatMessages: msgs } = useComfyStore.getState()
    const stitched = msgs
      .slice(-12)
      .map((m) => `${m.role === 'user' ? '用户' : '教练'}：${m.content}`)
      .join('\n\n')
    const baseSeed = seedInput.trim() || '探索阶段已完成，根据下方对话历史生成 BMC'
    const fullSeed = `${baseSeed}\n\n## 探索阶段对话\n${stitched}`
    await callLangGraph(fullSeed, 'seed').catch((err) => {
      console.error('[graduate] BMC pipeline failed', err)
    })
  }, [callLangGraph, isOrchestratorProcessing, seedInput])

  const handleRunCritic = useCallback(async () => {
    // P12 fix M2 · empty-canvas guard. Re-Calc on empty BMC returns
    // 0 conflicts but the previous "冲突扫描完成" message went into a
    // collapsed chat dock, leaving the user with no visible feedback
    // (just a tiny blue dot on the chat icon). Now we open the dock
    // when there's no BMC to scan and tell the user why.
    const { nodes: storeNodes } = useComfyStore.getState()
    const bmcCount = storeNodes.filter(
      (n) => typeof (n.data as { meta?: { macraType?: string } })?.meta?.macraType === 'string'
        && (n.data as { meta: { macraType: string } }).meta.macraType === 'cc-bmc-card'
    ).length
    if (bmcCount === 0) {
      appendChatMessage({
        role: 'assistant',
        content: '⚠ 画布上还没有 BMC 节点，无可检测的冲突。先用 7 步向导生成 BMC 后再 Re-Calc。',
        source: 'scripted'
      })
      setChatOpen(true)
      return
    }
    try {
      await callCritic()
      appendChatMessage({
        role: 'assistant',
        content: `冲突扫描完成（已检查 ${bmcCount} 个 BMC 节点）。如发现问题，已在画布上标记。`,
        source: 'scripted'
      })
      setChatOpen(true)
    } catch (error) {
      console.error('冲突检测失败:', error)
      appendChatMessage({
        role: 'assistant',
        content: `❌ 冲突检测失败：${error instanceof Error ? error.message : String(error)}`,
        source: 'error'
      })
      setChatOpen(true)
    }
  }, [appendChatMessage, callCritic])

  const handleApproveAutoRevise = useCallback(async () => {
    if (!pendingDecisionRequest) return
    await approveDecision(pendingDecisionRequest.conversationId, 'auto_revise')
    appendChatMessage({ role: 'assistant', content: '已指示 Agent 自行修正冲突。' })
  }, [appendChatMessage, approveDecision, pendingDecisionRequest])

  const handleApproveCustomDecision = useCallback(async () => {
    if (!pendingDecisionRequest || !hitlInput.trim()) return
    await approveDecision(pendingDecisionRequest.conversationId, hitlInput.trim())
    appendChatMessage({ role: 'assistant', content: `已将你的指导 "${hitlInput.trim()}" 传达给 Agent。` })
    setHitlInput('')
  }, [appendChatMessage, approveDecision, hitlInput, pendingDecisionRequest])

  const handleAcceptCurrentDecision = useCallback(async () => {
    if (!pendingDecisionRequest) return
    await approveDecision(pendingDecisionRequest.conversationId, 'accept_current')
    appendChatMessage({ role: 'assistant', content: '已接受当前分析结果。' })
    setWorkflowStage('output', 'decision-accepted')
  }, [appendChatMessage, approveDecision, pendingDecisionRequest, setWorkflowStage])

  const shellContext = useMemo(() => ({
    workspaceId,
    isAnimating,
    viewMode,
    seedInput,
    onSeedInputChange: handleSeedInputChange,
    onAddNode: addNode,
    onSeedGeneration: handleSeedGeneration,
    onRunCritic: handleRunCritic,
    onSendChat: handleSendChat,
    pendingDecisionRequest: pendingDecisionRequest
      ? {
          conversationId: pendingDecisionRequest.conversationId,
          payload: {
            decision: pendingDecisionRequest.payload.decision,
            occurredAt: pendingDecisionRequest.payload.occurredAt
          }
        } satisfies PendingDecisionRequest
      : null,
    hitlInput,
    onHitlInputChange: setHitlInput,
    onApproveAutoRevise: handleApproveAutoRevise,
    onApproveCustomDecision: handleApproveCustomDecision,
    onAcceptCurrentDecision: handleAcceptCurrentDecision
  }), [
    workspaceId,
    isAnimating,
    viewMode,
    seedInput,
    handleSeedInputChange,
    addNode,
    handleSeedGeneration,
    handleRunCritic,
    handleSendChat,
    pendingDecisionRequest,
    hitlInput,
    handleApproveAutoRevise,
    handleApproveCustomDecision,
    handleAcceptCurrentDecision
  ])

  // Standalone mode: bypass WorkspaceShell + panel rails entirely.
  // Renders just the CanvasHeader on top + CanvasFlow taking the
  // rest of the viewport. Detail drawer + tutorial dialog still
  // available as overlays. Only honoured for freeform mode (BMC
  // grid view requires the shell's persistent panels).
  // Shared BMC grid view content — used by BOTH standalone and full
  // (WorkspaceShell-wrapped) renders so the visual treatment is the
  // same regardless of route. v2 editorial: ash-bordered hairlines,
  // mono kicker stats, no cyan/amber blur orbs, no glass cards.
  const bmcGridContent = (
    <main
      className={`relative flex-1 overflow-hidden bg-stratum-surface ${
        isAnimating ? 'opacity-0' : 'animate-fade-in-up'
      }`}
      style={{ animationDelay: '0.3s' }}
    >
      <div className="relative z-[1] flex h-full flex-col px-6 pb-6 pt-5">
        {/* Mast — kicker + Manrope-style title + readout stats */}
        <header className="mb-4 flex items-baseline justify-between gap-6 border-b border-stratum-line pb-3">
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-3.5 w-3.5 text-stratum-blue self-center" strokeWidth={1.75} />
              <span className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-blue">
                STRUCTURED BUSINESS MODEL · 九宫格
              </span>
            </div>
            <h2 className="font-display font-[700] text-[20px] tracking-tight text-stratum-navy truncate">
              CC-BMC 结构化输出视图
            </h2>
            <p className="font-body text-[12px] leading-[1.55] text-stratum-muted max-w-measure-body">
              用于答辩演示、结构化审阅和维度冲突检查。自由画布负责推演，九宫格负责归档表达。
            </p>
          </div>
          <div className="flex items-stretch gap-0 shrink-0 bg-white border border-stratum-line rounded-xl shadow-sm overflow-hidden">
            <div className="flex flex-col items-center justify-center px-4 py-2 border-r border-stratum-line min-w-[88px]">
              <span className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-muted">
                BMC NODES
              </span>
              <span className="font-display font-[700] text-[22px] tabular-nums text-stratum-navy leading-none mt-1">
                {String(structuredNodes.length).padStart(2, '0')}
              </span>
            </div>
            <div className="flex flex-col items-center justify-center px-4 py-2 min-w-[88px]">
              <span className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-stratum-muted">
                CONFLICTS
              </span>
              <span
                className={`font-display font-[700] text-[22px] tabular-nums leading-none mt-1 ${
                  conflictAlertCount > 0 ? 'text-stratum-danger' : 'text-stratum-navy'
                }`}
              >
                {String(conflictAlertCount).padStart(2, '0')}
              </span>
            </div>
          </div>
        </header>

        {/* Grid surface */}
        <div className="relative min-h-0 flex-1 rounded-2xl border border-stratum-line bg-white shadow-sm overflow-hidden">
          {structuredNodes.length > 0 ? (
            <BmcGrid
              nodes={structuredNodes}
              conflicts={[]}
              onNodeClick={(node) => openDetailPanel(node.id)}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center px-6">
              <PanelsTopLeft className="h-8 w-8 text-stratum-blue/60" strokeWidth={1.25} />
              <div className="space-y-2">
                <h3 className="font-display font-[700] text-[15px] tracking-tight text-stratum-navy">
                  还没有可展示的 BMC 结构节点
                </h3>
                <p className="font-body text-[12px] leading-[1.55] text-stratum-muted max-w-measure-cell">
                  先在自由画布中运行多智能体分析或补充业务节点，系统会把带有商业维度的结果自动归入九宫格视图。
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )

  const freeformContent = (
    <div className="relative h-full w-full flex flex-col">
      <CanvasFlow
        // Conflict-alert nodes are not rendered on canvas. Instead, each
        // conflict is shown as a red dashed edge between the two BMC
        // cells it implicates (see buildConflictEdges). Click an edge →
        // open Insight Panel · 审查 tab + auto-expand the conflict.
        nodes={nodesWithoutConflicts}
        edges={edgesWithConflicts}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgeClick={handleEdgeClick}
        isAnimating={isAnimating}
      />
      {/* P11.14 · floating wire widget shows live sub-agent activity
          (market-agent → web-search…, product-agent → 解析输出, ...).
          Positions itself bottom-left of the canvas. */}
      <SubAgentWireWidget />
    </div>
  )

  // Standalone (chromeless) — honour for BOTH viewModes so flipping the
  // header segmented control doesn't suddenly summon WorkspaceShell.
  if (standalone) {
    return (
      <div className="h-screen w-screen flex flex-col bg-stratum-surface overflow-hidden">
        <CanvasHeader
          isAnimating={isAnimating}
          onOpenTutorial={() => setShowTutorial(true)}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          workflowStage={workflowStage}
          onExportCanvas={handleExportCanvas}
          onImportCanvas={handleImportCanvas}
          onRecalculate={handleRunCritic}
          isRecalculating={isOrchestratorProcessing}
        />
        {/* P13 · pipeline 5-stage progress strip — auto-hides 10s after
            terminal; renders nothing when canvas is fresh (all pending). */}
        <CanvasStageStrip />
        <div className="flex-1 relative flex flex-col min-h-0">
          {viewMode === 'freeform' ? freeformContent : bmcGridContent}
          {viewMode === 'freeform' ? (
            <>
              {!chatOpen && !citationOpen ? <CanvasPerspectiveToggle /> : null}
              <CanvasThinkingOverlay
                visible={isOrchestratorProcessing || workflowStage === 'thinking' || workflowStage === 'revising'}
                workflowStage={workflowStage}
              />
              <CanvasHitlBanner
                visible={!!pendingDecisionRequest}
                onAutoRevise={handleApproveAutoRevise}
                onAcceptCurrent={handleAcceptCurrentDecision}
              />
              <CanvasChatDock
                open={chatOpen}
                // P8 anti-overlap: chat + citation share z-10 and collide
                // horizontally on viewports < 1100px. Auto-close citation
                // when opening chat at narrow widths.
                onToggle={() => {
                  setChatOpen((prev) => {
                    const next = !prev
                    if (next && typeof window !== 'undefined' && window.innerWidth < 1100) {
                      setCitationOpen(false)
                    }
                    return next
                  })
                }}
                onSend={handleSendChat}
                onGraduate={handleGraduateToBmc}
                workspaceId={workspaceId}
              />
              <CanvasCitationPanel
                open={citationOpen}
                onToggle={() => {
                  setCitationOpen((prev) => {
                    const next = !prev
                    if (next && typeof window !== 'undefined' && window.innerWidth < 1100) {
                      setChatOpen(false)
                    }
                    return next
                  })
                }}
                workspaceId={workspaceId}
                highlightedConflictId={focusedConflictId}
              />
              {/* Floating KB button — Mode B entry point on canvas. Sits
                  bottom-left so it doesn't collide with chat dock when
                  open (chat takes top-left), nor the action bar (center). */}
              {/* P10 final · KB / Memory / Wizard 按钮已移到 CanvasLiveCoach
                  组件的 footer，紧贴 Coach 面板下方（不再用绝对定位，
                  完美追随 Coach 高度变化）。原本这里的 3 个浮动按钮已删。 */}
              {/* P11.18 · Agent SLO health chip (bottom-right). Polls
                  /health/agents every 30s; auto-hides when no agent data
                  yet, turns red when any agent is degraded. Click to
                  expand per-agent SLO detail. */}
              <AgentHealthChip />
            </>
          ) : null}
        </div>
        <CanvasTutorialDialog
          open={showTutorial}
          tutorialStep={tutorialStep}
          onClose={handleCloseTutorial}
          onNext={handleNextStep}
        />
        <CanvasPromptDialog
          open={showPromptDialog}
          initialValue={seedInput}
          isSubmitting={isOrchestratorProcessing}
          onClose={() => setShowPromptDialog(false)}
          onSubmit={handlePromptSubmit}
        />
        <KbUploadModal
          open={kbModalOpen}
          workspaceId={workspaceId}
          onClose={() => setKbModalOpen(false)}
          onAnalyze={(kbId) => {
            // Trigger BMC pipeline with this KB as RAG source
            void callLangGraph(
              '基于已上传的资料生成 BMC 商业画布，使用 RAG 检索关键证据',
              'seed',
              kbId
            ).catch((err) => console.warn('[canvas] kb-analyze failed', err))
          }}
        />
        {focusedDrawerKind === 'report' ? <ReportDetailDrawer /> : <CCBMCDetailDrawer />}
        <EvidenceDrawer conversationId={workspaceId} />
        <MemoryDrawer
          open={memoryOpen}
          onClose={() => setMemoryOpen(false)}
          workspaceId={workspaceId}
        />
        <CanvasWizardPanel
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          workspaceId={workspaceId}
        />
        {/* Live coach: small floating panel that adapts its message to
            workflowStage + canvas content. Sits top-right; user can
            collapse into a single COACH chip if they want to focus.
            Hidden when wizard is open (wizard already gives guidance). */}
        {!wizardOpen ? (
          <CanvasLiveCoach
            workspaceId={workspaceId}
            shiftLeftForPanel={citationOpen}
            onOpenWizard={() => {
              // Primary path: in-chat wizard (one continuous thread,
              // user sees BMC nodes appear as they answer). The
              // side-drawer wizard is still available via its own
              // floating button for users who prefer dedicated UI.
              // Sprint 1.2 · KB pre-read enabled by default.
              const { startWizardInChat } = useComfyStore.getState()
              setChatOpen(true)
              void startWizardInChat(workspaceId, true)
            }}
            onOpenKb={() => setKbModalOpen(true)}
            onOpenMemory={() => setMemoryOpen(true)}
            onShowConflicts={() => {
              setCitationOpen(true)
              // Picking the first conflict id surfaces the review tab
              // with that conflict expanded; null clears prior selection.
              const firstConflict = Array.from(macraNodes.values()).find(
                (n) => n.type === 'conflict-alert'
              )
              setFocusedConflictId(firstConflict?.id ?? null)
            }}
            onOpenChat={() => setChatOpen(true)}
          />
        ) : null}
      </div>
    )
  }

  return (
    <WorkspaceShell
      context={shellContext}
      header={
        <CanvasHeader
          isAnimating={isAnimating}
          onOpenTutorial={() => setShowTutorial(true)}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          workflowStage={workflowStage}
          onExportCanvas={handleExportCanvas}
          onImportCanvas={handleImportCanvas}
          onRecalculate={handleRunCritic}
          isRecalculating={isOrchestratorProcessing}
        />
      }
      main={viewMode === 'freeform' ? freeformContent : bmcGridContent}
      persistentOverlay={
        <>
          <CanvasTutorialDialog
            open={showTutorial}
            tutorialStep={tutorialStep}
            onClose={handleCloseTutorial}
            onNext={handleNextStep}
          />
          {focusedDrawerKind === 'report' ? <ReportDetailDrawer /> : <CCBMCDetailDrawer />}
        </>
      }
    />
  )
}

export const ComfyCanvasPage = CanvasPage
