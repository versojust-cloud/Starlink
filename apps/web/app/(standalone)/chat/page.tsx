import { ChatHomePage } from '@/features/chat/components/chat-home-page'

const DEFAULT_WORKSPACE_ID = 'proj-001'

export default function ChatHomeRoute() {
  // Single-workspace MVP — workspaceId comes from a stable default until
  // multi-workspace switching is wired. The chat home page itself is
  // workspace-scoped (conversations are bucketed by workspaceId in
  // localStorage), so swapping to a real account-bound id later is a
  // single line change.
  return <ChatHomePage workspaceId={DEFAULT_WORKSPACE_ID} />
}
