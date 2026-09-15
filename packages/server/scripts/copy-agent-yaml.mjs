#!/usr/bin/env node
/**
 * Postbuild step: copy `src/agents/<id>/agent.yaml` files into the matching
 * `dist/agents/<id>/agent.yaml` path so the runtime `makeProfileGetter`
 * (which uses `import.meta.url` to locate its own folder) finds the
 * profile at runtime.
 *
 * Without this, agents loaded from `dist/` (production gateway, benchmarks,
 * test runners) crash with ENOENT because vanilla tsc only emits .js/.d.ts —
 * non-source assets stay in src/.
 *
 * Surfaced by the agent-side test work (commit a2af376) where the critic
 * test would otherwise trigger graph.ts's `ready` IIFE → fail to load
 * agent.yaml → unhandled rejection. The test was patched by extracting
 * parseHumanDecision to a side-effect-free module; THIS script is the
 * structural fix that also unblocks production.
 *
 * Cross-platform: pure Node fs APIs, no shell tricks.
 */

import { readdirSync, statSync, existsSync, copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = resolve(here, '..')
const srcAgents = join(pkgRoot, 'src', 'agents')
const distAgents = join(pkgRoot, 'dist', 'agents')

if (!existsSync(srcAgents)) {
  console.error(`[copy-agent-yaml] src/agents not found at ${srcAgents}`)
  process.exit(1)
}
if (!existsSync(distAgents)) {
  console.error(
    `[copy-agent-yaml] dist/agents not found at ${distAgents}; ` +
      'run `tsc -p tsconfig.build.json` first.'
  )
  process.exit(1)
}

let copied = 0
let skipped = 0

for (const entry of readdirSync(srcAgents)) {
  const srcAgentDir = join(srcAgents, entry)
  if (!statSync(srcAgentDir).isDirectory()) continue
  const yamlSrc = join(srcAgentDir, 'agent.yaml')
  if (!existsSync(yamlSrc)) {
    skipped++
    continue
  }
  const distAgentDir = join(distAgents, entry)
  // Defensive: if tsc didn't emit anything for this agent (e.g. the dir
  // contained only a stub), still create the target dir so the yaml lands.
  mkdirSync(distAgentDir, { recursive: true })
  const yamlDest = join(distAgentDir, 'agent.yaml')
  copyFileSync(yamlSrc, yamlDest)
  copied++
}

console.log(`[copy-agent-yaml] copied ${copied} yaml file(s); skipped ${skipped} dir(s) without yaml`)
