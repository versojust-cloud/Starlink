/**
 * Thrown by ConversationStore.startConversation when the workspace
 * already has a 'running' conversation. Implements the DEC-5 soft-lock
 * referenced in .env.example — without it, two concurrent BMC graphs
 * race on memory_items writes and canvas mutations against the same
 * workspace_id.
 *
 * The class lives in its own module (rather than inside conversation-store.ts)
 * so unit tests can import the type without transitively pulling in the
 * PG pool — conversation-store.ts touches the DB at module load.
 *
 * Carries the active conversation id so the resolver / frontend can
 * surface a "resume the existing one or cancel it first" UX rather
 * than just bouncing the user.
 */
export class WorkspaceLockError extends Error {
  constructor(
    public readonly workspaceId: string,
    public readonly activeConversationId: string
  ) {
    super(`Workspace ${workspaceId} already has an active conversation: ${activeConversationId}`)
    this.name = 'WorkspaceLockError'
  }
}
