# Multi-stage build for @starlink/server.
#
# Stage 1 (deps):  Install workspace dependencies via corepack pnpm. Cached
#                  on package.json + pnpm-lock so editing source doesn't
#                  re-download node_modules.
# Stage 2 (build): Compile TypeScript + run copy-agent-yaml.mjs postbuild.
# Stage 3 (run):   Slim runtime image. Only dist/, prod node_modules, and
#                  the agent.yaml profiles needed at runtime. Runs as a
#                  non-root user.
#
# Build context expected: repo root (so workspace files are visible).
#   docker build -f packages/server/Dockerfile -t starlink-server .

# ============================================================================
FROM node:22-alpine AS deps

WORKDIR /repo

# corepack ships with Node 22 but is disabled by default — enable + pin pnpm
# version implicitly via the workspace's `packageManager` field.
RUN corepack enable

# Workspace files needed for `pnpm install --frozen-lockfile`
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/server/package.json packages/server/
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/

RUN corepack pnpm install --frozen-lockfile --prod=false

# ============================================================================
FROM deps AS build

WORKDIR /repo

# Source tree (avoid copying apps/web — server build doesn't need it)
COPY packages/shared packages/shared
COPY packages/server packages/server

# Build shared first (server depends on it via workspace:*) then server
RUN corepack pnpm --filter @starlink/shared build \
 && corepack pnpm --filter @starlink/server build

# ============================================================================
FROM node:22-alpine AS run

WORKDIR /app

RUN corepack enable \
 && addgroup -S starlink \
 && adduser  -S -G starlink starlink

# Copy compiled output + lean prod-only dependency tree
COPY --from=build /repo/packages/server/dist ./dist
COPY --from=build /repo/packages/server/package.json ./package.json
COPY --from=build /repo/packages/shared ./node_modules/@starlink/shared
COPY --from=build /repo/node_modules ./node_modules

USER starlink

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

# /health is the cheap liveness probe (process up). /ready also probes PG.
# Orchestrators should target /health for liveness and /ready for readiness.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:4000/health > /dev/null || exit 1

CMD ["node", "dist/index.js"]
