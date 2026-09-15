# Starlink Project Summary

## 1. Project Vision & Overview
**Starlink** (formerly Branching Chat) is a "Conversation as Canvas" collaboration platform. It visualizes complex topics as a network of nodes, allowing users to explore ideas through branching dialogues assisted by AI.

The core concept is to break down a problem into branches, dimensions, action plans, and evidence, helping teams synchronize understanding and planning. It combines an infinite canvas (powered by React Flow/tldraw concepts) with AI chat capabilities.

## 2. Architecture
The project is a monorepo managed by **pnpm workspaces**, consisting of the following main components:

### 2.1 Frontend (`frontend/`)
- **Framework**: Next.js (App Router).
- **Core Libraries**: React Flow (Canvas), TanStack Query (Data Fetching), Zustand (State Management), Tailwind CSS (Styling).
- **Key Features**:
    - **CanvasViewport**: Renders the node-based conversation graph.
    - **AssistantPanel**: AI chat interface.
    - **DocumentDrawer**: For managing related documents.
    - **Real-time Updates**: Uses GraphQL Subscriptions (SSE/WS) for live canvas updates.

### 2.2 GraphQL Gateway (`packages/server/`)
- **Framework**: Express + Apollo Server.
- **Role**: Acts as the central gateway, aggregating data from the canvas and triggering Dify workflows.
- **Key Features**:
    - **Resolvers**: Bind conversation context with canvas data.
    - **Dify Integration**: Calls Dify workflows to generate summaries and graph structures.
    - **Subscriptions**: Pushes `conversationProgress` events (graph updates, status changes) to the frontend.

### 2.3 Shared Library (`packages/shared/`)
- **Role**: Contains shared Zod schemas and TypeScript types used by both frontend and server to ensure data consistency (e.g., `CanvasNodeData`, `CanvasGraph`).

### 2.4 Legacy Backend (`backend/`)
- **Framework**: Express + Prisma + LangChain.
- **Role**: Provides Knowledge Base (KB) services, file uploads, and legacy analysis endpoints.
- **Status**: Some functionality is being migrated to the GraphQL Gateway/Dify, but it currently handles specific API routes proxied by the frontend.

### 2.5 Configuration (`config/`)
- Centralized environment variable management for Supabase, Dify, and other external services.

## 3. Key Workflows
1.  **Conversation Start**: User asks a question -> GraphQL Gateway triggers Agent Runtime -> Generates initial graph structure -> Pushed to frontend via Subscription.
2.  **Canvas Interaction**: Users can drag/drop nodes. (Manual mutation is a planned feature).
3.  **Analysis**: Complex analysis tasks are routed to the Legacy Backend or Dify workflows to generate insights or timeline suggestions.

## 4. Technology Stack
- **Languages**: TypeScript (primary).
- **Runtime**: Node.js (18+).
- **Package Manager**: pnpm.
- **Database**: PostgreSQL (via Prisma in `backend/`).
- **AI Integration**: Dify, OpenAI-compatible APIs, LangChain.
- **Testing**: Playwright (E2E), Jest (Backend).

## 5. Development Setup
- **Install**: `pnpm install` (root).
- **Run Server**: `pnpm dev:server` (Port 4000).
- **Run Frontend**: `pnpm dev:frontend` (Port 3000).
- **Run Legacy Backend**: `pnpm --filter backend dev` (Optional/As needed).

## 6. Future Roadmap
- **Mutation Coverage**: Add full GraphQL mutations for manual node manipulation.
- **Knowledge Base**: Fully integrate the KB client.
- **Auth**: Implement multi-tenant authentication (currently anonymous).
- **Migration**: Complete the migration from Legacy Backend to the GraphQL Gateway architecture.
