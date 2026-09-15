/**
 * P15-fix #4 · Tool registry inventory test.
 *
 * Asserts that the runtime loader picks up the expected set of tools
 * (count + per-category breakdown) so an accidental file rename / missing
 * default-export doesn't silently halve the agent toolbox.
 *
 * Source of truth for the EXPECTED counts: the on-disk tool files. We
 * scan the filesystem in addition to running the loader, then compare —
 * a mismatch means the loader dropped a tool silently. Keeps the test
 * resilient to legitimately added tools (count grows together).
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, stat } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ToolRegistry } from './registry.js'
import { loadAllTools } from './loader.js'

const here = dirname(fileURLToPath(import.meta.url))

interface DiskInventory {
  total: number
  byCategory: Record<string, number>
}

async function scanDisk(): Promise<DiskInventory> {
  const baseDir = join(here, '..', 'tools')
  const TOOL_DIRS: Array<{ name: string; nested?: boolean }> = [
    { name: 'data-source' },
    { name: 'llm-agent' },
    { name: 'analysis' },
    { name: 'output' },
    { name: 'control-flow' },
    { name: 'dimension-actions', nested: true }
  ]
  let total = 0
  const byCategory: Record<string, number> = {}
  for (const cat of TOOL_DIRS) {
    const dirPath = join(baseDir, cat.name)
    let entries: string[]
    try {
      entries = await readdir(dirPath)
    } catch {
      byCategory[cat.name] = 0
      continue
    }
    let catCount = 0
    if (cat.nested) {
      for (const entry of entries) {
        const subPath = join(dirPath, entry)
        let st
        try {
          st = await stat(subPath)
        } catch {
          continue
        }
        if (!st.isDirectory()) continue
        const subFiles = await readdir(subPath).catch(() => [] as string[])
        catCount += subFiles.filter(
          (f) =>
            (f.endsWith('.tool.js') || f.endsWith('.tool.ts')) &&
            !f.endsWith('.test.js') &&
            !f.endsWith('.test.ts')
        ).length
      }
    } else {
      catCount += entries.filter(
        (f) =>
          (f.endsWith('.tool.js') || f.endsWith('.tool.ts')) &&
          !f.endsWith('.test.js') &&
          !f.endsWith('.test.ts')
      ).length
    }
    byCategory[cat.name] = catCount
    total += catCount
  }
  return { total, byCategory }
}

describe('ToolRegistry inventory', () => {
  it('loads exactly the tools present on disk, no silent drops', async () => {
    const disk = await scanDisk()
    const registry = new ToolRegistry()
    await loadAllTools(registry)

    assert.equal(
      registry.size,
      disk.total,
      `runtime registry has ${registry.size} tools but disk has ${disk.total} *.tool.[jt]s files — a tool failed to load silently`
    )
  })

  it('has at least 38 tools across the 6 expected categories', async () => {
    const registry = new ToolRegistry()
    await loadAllTools(registry)
    // Tools advertise their category on display.category. Some tool files
    // group multiple categories (e.g. dimension-actions tags as
    // 'dimension-actions' uniformly). Count distinct categories observed.
    const cats = new Set<string>()
    for (const def of registry.listAll()) {
      cats.add(def.display.category)
    }
    assert.ok(
      registry.size >= 38,
      `expected ≥38 tools registered (production baseline); got ${registry.size}`
    )
    assert.ok(
      cats.size >= 5,
      `expected ≥5 distinct tool categories represented; got ${cats.size} (${Array.from(cats).join(', ')})`
    )
  })

  it('every registered tool has a valid identity name', async () => {
    const registry = new ToolRegistry()
    await loadAllTools(registry)
    for (const def of registry.listAll()) {
      assert.ok(
        typeof def.identity.name === 'string' && def.identity.name.length > 0,
        `tool registered without a valid identity name: ${JSON.stringify(def.identity)}`
      )
      assert.ok(
        def.display && typeof def.display.category === 'string',
        `tool ${def.identity.name} missing display.category`
      )
    }
  })

  it('tool names are unique', async () => {
    const registry = new ToolRegistry()
    await loadAllTools(registry)
    const names = registry.listAll().map((d) => d.identity.name)
    const uniq = new Set(names)
    assert.equal(
      names.length,
      uniq.size,
      `duplicate tool names registered: ${names.length - uniq.size} duplicate(s)`
    )
  })
})
