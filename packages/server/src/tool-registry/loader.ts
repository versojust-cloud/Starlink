import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BaseTool } from '@starlink/shared'
import type { ToolRegistry } from './registry.js'

/**
 * Top-level tool categories. Each entry can be either:
 *   - A flat directory (scan for *.tool.* files directly)
 *   - A two-level directory where each immediate subdir holds tool files
 *     (required for Phase 3.3 dimension-actions which groups by BMC dim)
 */
const TOOL_DIRS: Array<{ name: string; nested?: boolean }> = [
  { name: 'data-source' },
  { name: 'llm-agent' },
  { name: 'analysis' },
  { name: 'output' },
  { name: 'control-flow' },
  { name: 'dimension-actions', nested: true }
]

export async function loadAllTools(registry: ToolRegistry): Promise<void> {
  const baseDir = join(fileURLToPath(import.meta.url), '..', '..', 'tools')

  for (const category of TOOL_DIRS) {
    const dirPath = join(baseDir, category.name)
    let entries: string[]
    try {
      entries = await readdir(dirPath)
    } catch {
      continue
    }

    if (category.nested) {
      for (const entry of entries) {
        const subPath = join(dirPath, entry)
        let entryStat
        try {
          entryStat = await stat(subPath)
        } catch {
          continue
        }
        if (!entryStat.isDirectory()) continue
        await loadToolFilesFromDir(subPath, registry, `${category.name}/${entry}`)
      }
    } else {
      await loadToolFilesFromDir(dirPath, registry, category.name)
    }
  }

  console.log(`[tool-loader] Loaded ${registry.size} tools`)
}

async function loadToolFilesFromDir(
  dirPath: string,
  registry: ToolRegistry,
  label: string
): Promise<void> {
  let files: string[]
  try {
    files = await readdir(dirPath)
  } catch {
    return
  }
  const toolFiles = files.filter(
    (f) =>
      (f.endsWith('.tool.js') || f.endsWith('.tool.ts')) &&
      !f.endsWith('.test.js') &&
      !f.endsWith('.test.ts')
  )
  for (const file of toolFiles) {
    try {
      const modulePath = join(dirPath, file)
      const mod = (await import(modulePath)) as { default: new () => BaseTool }
      if (mod.default) {
        const tool = new mod.default()
        registry.register(tool)
      }
    } catch (err) {
      console.warn(`[tool-loader] Failed to load tool ${label}/${file}:`, err)
    }
  }
}
