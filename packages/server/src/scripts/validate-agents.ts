/**
 * validate:agents — CI gate.
 * pnpm --filter @starlink/server validate:agents
 */

import { readdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadAgentProfile } from '../capabilities/profile-loader.js'
import { ToolRegistry } from '../tool-registry/registry.js'
import { loadAllTools } from '../tool-registry/loader.js'
import { validateAgentTools } from '../capabilities/tool-resolver.js'

interface Report {
  id: string
  path: string
  ok: boolean
  errors: string[]
  warnings: string[]
}

const here = dirname(fileURLToPath(import.meta.url))
const agentsDir = join(here, '..', 'agents')

async function main(): Promise<void> {
  console.log('[validate:agents] scanning:', agentsDir)
  const entries = await readdir(agentsDir, { withFileTypes: true })

  const toolRegistry = new ToolRegistry()
  try {
    await loadAllTools(toolRegistry)
  } catch (err) {
    console.warn('[validate:agents] ⚠ loadAllTools failed:', err)
  }

  const reports: Report[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name === 'shared') continue

    const yamlPath = join(agentsDir, entry.name, 'agent.yaml')
    try {
      const stats = await stat(yamlPath)
      if (!stats.isFile()) continue
    } catch {
      continue
    }

    const report: Report = { id: entry.name, path: yamlPath, ok: true, errors: [], warnings: [] }
    try {
      const profile = await loadAgentProfile(yamlPath)
      report.id = profile.id

      if (profile.tools.length > 0 && toolRegistry.size === 0) {
        report.warnings.push(
          `Cannot validate ${profile.tools.length} tool(s) — ToolRegistry is empty`
        )
      } else if (profile.tools.length > 0) {
        try {
          validateAgentTools(profile, toolRegistry)
        } catch (err) {
          report.ok = false
          report.errors.push((err as Error).message)
        }
      }
    } catch (err) {
      report.ok = false
      report.errors.push((err as Error).message)
    }
    reports.push(report)
  }

  const failed = reports.filter((r) => !r.ok)
  const passed = reports.filter((r) => r.ok)

  console.log(`\n[validate:agents] ${passed.length} agent(s) passed:`)
  for (const r of passed) {
    const warnNote = r.warnings.length ? ` ⚠  ${r.warnings.length} warning(s)` : ''
    console.log(`  ✓ ${r.id}${warnNote}`)
    for (const w of r.warnings) console.log(`      · ${w}`)
  }

  if (failed.length > 0) {
    console.log(`\n[validate:agents] ${failed.length} agent(s) FAILED:`)
    for (const r of failed) {
      console.log(`  ✗ ${r.id}  (${r.path})`)
      for (const e of r.errors) console.log(`      · ${e}`)
    }
    process.exit(1)
  }

  console.log('\n[validate:agents] ✓ all agent profiles valid')
}

main().catch((err) => {
  console.error('[validate:agents] unexpected failure:', err)
  process.exit(1)
})
