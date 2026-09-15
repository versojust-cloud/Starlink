/**
 * Agent barrel entry + YAML auto-scan loader.
 *
 * All agents live under agents/<name>/{agent.yaml, graph.ts}. Each graph.ts
 * exports a `ready: Promise<void>` that resolves once registerAgent /
 * registerAdvisor side-effect is done. loadYamlAgents() awaits all of
 * them so the registry is fully populated before callers query it.
 */

import { readdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAuditLogger } from '@starlink/shared'

const auditLogger = createAuditLogger('packages/server:agents:loader')

const here = dirname(fileURLToPath(import.meta.url))

interface YamlAgentModule {
  ready?: Promise<unknown>
}

let yamlLoadPromise: Promise<string[]> | undefined

export function loadYamlAgents(): Promise<string[]> {
  if (!yamlLoadPromise) {
    yamlLoadPromise = runLoadYamlAgents()
  }
  return yamlLoadPromise
}

async function runLoadYamlAgents(): Promise<string[]> {
  const loaded: string[] = []
  let entries
  try {
    entries = await readdir(here, { withFileTypes: true })
  } catch (err) {
    auditLogger.warn({
      action: 'agents.loader.scan-failed',
      metadata: { dir: here, error: String(err) }
    })
    return loaded
  }

  const pendingReady: Promise<unknown>[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name === 'shared') continue
    const agentDir = entry.name
    const yamlPath = join(here, agentDir, 'agent.yaml')

    try {
      const stats = await stat(yamlPath)
      if (!stats.isFile()) continue
    } catch {
      continue
    }

    try {
      const mod = (await import(`./${agentDir}/graph.js`)) as YamlAgentModule
      if (mod.ready) {
        pendingReady.push(mod.ready)
      }
      loaded.push(agentDir)
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(
          `loadYamlAgents: failed to import agents/${agentDir}/graph.js — ${(err as Error).message}`
        )
      }
      auditLogger.error({
        action: 'agents.loader.import-failed',
        metadata: { agentDir, error: String(err) },
        error: err as Error
      })
    }
  }

  await Promise.all(pendingReady)

  auditLogger.info({
    action: 'agents.loader.completed',
    metadata: { count: loaded.length, agents: loaded }
  })
  return loaded
}

export async function ensureYamlAgentsLoaded(): Promise<void> {
  await loadYamlAgents()
}
