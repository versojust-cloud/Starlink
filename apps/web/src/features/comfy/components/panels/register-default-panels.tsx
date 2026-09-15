import '../../registries/default-tools'
import { ChatHistoryPanel } from './chat-history-panel'
import { ChatInputPanel } from './chat-input-panel'
import { CriticActionPanel } from './critic-action-panel'
import { HitlDecisionOverlayPanel } from './hitl-decision-overlay-panel'
import { KnowledgeEvidencePanel } from './knowledge-evidence-panel'
import { NodePalettePanel } from './node-palette-panel'
import { SeedInputPanel } from './seed-input-panel'
import { ThinkingPanel } from './thinking-panel'
import { ToolDrawerPanel } from './tool-drawer-panel'
import { EvidenceDrawer } from '../evidence-drawer'
import { registerPanel } from '../../registries/panel-registry'
import { useComfyStore } from '../../store'

registerPanel({
  id: 'seed-input',
  slot: 'left-rail',
  order: 10,
  component: SeedInputPanel,
  visibleWhen: (context) =>
    context.stage === 'idle' ||
    context.stage === 'input' ||
    context.stage === 'output' ||
    context.stage === 'failed' ||
    context.stage === 'cancelled'
})

registerPanel({
  id: 'node-palette',
  slot: 'left-rail',
  order: 20,
  component: NodePalettePanel,
  visibleWhen: () => true
})

registerPanel({
  id: 'knowledge-evidence',
  slot: 'left-rail',
  order: 30,
  component: KnowledgeEvidencePanel,
  visibleWhen: (context) =>
    context.stage === 'output' ||
    context.stage === 'review' ||
    context.stage === 'revising'
})

registerPanel({
  id: 'critic-action',
  slot: 'left-rail',
  order: 40,
  component: CriticActionPanel,
  visibleWhen: (context) =>
    context.stage === 'output' ||
    context.stage === 'review' ||
    context.stage === 'revising'
})

registerPanel({
  id: 'thinking-panel',
  slot: 'right-rail',
  order: 10,
  component: ThinkingPanel,
  visibleWhen: (context) =>
    context.stage === 'thinking' ||
    context.stage === 'review' ||
    context.stage === 'revising'
})

registerPanel({
  id: 'chat-history',
  slot: 'right-rail',
  order: 20,
  component: ChatHistoryPanel,
  visibleWhen: () => true
})

registerPanel({
  id: 'chat-input',
  slot: 'bottom-tray',
  order: 10,
  component: ChatInputPanel,
  visibleWhen: (context) => context.stage !== 'review'
})

registerPanel({
  id: 'hitl-decision-overlay',
  slot: 'overlay',
  order: 10,
  component: HitlDecisionOverlayPanel,
  visibleWhen: (context) => context.stage === 'review' || context.hasPendingInterrupt
})

registerPanel({
  id: 'tool-drawer',
  slot: 'overlay',
  order: 20,
  component: ToolDrawerPanel,
  visibleWhen: (context) => context.activeToolId !== null && !context.hasPendingInterrupt
})

function EvidenceDrawerOverlay() {
  const isOpen = useComfyStore((state) => state.evidenceDrawer.isOpen)
  if (!isOpen) return null
  return <EvidenceDrawer />
}

registerPanel({
  id: 'evidence-drawer',
  slot: 'overlay',
  order: 30,
  component: EvidenceDrawerOverlay,
  visibleWhen: () => true
})
