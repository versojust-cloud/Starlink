# Repository Guidelines

## Project Structure & Module Organization
- `frontend/` is the Next.js App Router client; feature code lives under `app/`, shared UI in `components/`, hooks in `hooks/`, and integration tests in `tests/`.
- `packages/server/` exposes the Express + Apollo GraphQL gateway (`src/index.ts`), with schemas in `src/graphql/type-defs.ts` and resolvers in `src/graphql/resolvers.ts`.
- `packages/shared/` contains Zod schemas and cross-service TypeScript types; `packages/ui/` holds reusable canvas widgets consumed by the frontend.
- `backend/` hosts the knowledge-base service (Express + Prisma). It is not part of the pnpm workspace and keeps its own `package.json` and `prisma/` migrations.
- Support assets sit in `config/` (runtime key loaders) and `docs/` for architecture notes.

## Build, Test, and Development Commands
- Install workspaces once: `pnpm install`.
- Start canvas client: `pnpm dev:frontend` (http://localhost:3000).
- Run GraphQL gateway: `pnpm dev:server` (http://localhost:4000/graphql).
- Production builds: `pnpm build:frontend` and `pnpm build:server`.
- Frontend e2e suite: `pnpm test:e2e` (use `pnpm test:e2e:headed` for debugging).
- Backend service is standalone; from `backend/` run `npm install` then `npm run dev` / `npm run test`.

## Coding Style & Naming Conventions
- TypeScript everywhere; use 2-space indentation, single quotes, and avoid semicolons to match existing files.
- React components follow `PascalCase.tsx`; hooks live in `hooks/` and use the `useX` naming pattern.
- GraphQL files group schema fragments by feature under `packages/server/src/graphql/`.
- Run `npm run lint -w frontend` or `pnpm --filter @starlink/server lint` before sending changes.
- Tailwind is the primary styling layer; compose utility classes instead of ad-hoc CSS.

## Testing Guidelines
- Playwright specs live in `frontend/tests/`; add new journeys beside related features and prefer descriptive filenames like `canvas-dragging.spec.ts`.
- Server-side logic should be covered with Jest in `backend/src/tests/`; name files `*.test.ts` and seed Prisma with lightweight fixtures.
- Ensure new behavior is covered by either Playwright or unit tests; coordinate mocks via `packages/shared` types to keep contracts consistent.

## Commit & Pull Request Guidelines
- Follow an imperative, present-tense subject line under 72 characters (e.g., `Add canvas focus shortcut`), referencing an issue ID when available.
- Keep commits scoped to one concern; include config or generated changes in a separate commit if substantial.
- PRs must outline the change, testing performed (`pnpm test:e2e`, `npm run test`), and any schema or environment updates; attach UI screenshots or GraphQL schema diffs when they help reviewers.

## Environment & Secrets
- Copy `.env.example` values (when present) into `frontend/.env.local` and `packages/server/.env` to configure Supabase, Dify, or alternate GraphQL endpoints.
- Never commit secrets—use `config/keys.js` helpers to load keys via environment variables, and document required variables in the PR description.
