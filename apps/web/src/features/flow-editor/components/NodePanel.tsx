'use client'

import { useState, useMemo, useCallback, type DragEvent } from 'react'

interface ToolItem {
  name: string
  label: string
  category: string
  icon?: string
  color?: string
}

interface UseToolRegistryResult {
  tools: ToolItem[]
  isLoading: boolean
}

/**
 * Stub hook -- replace with your actual tool registry hook.
 */
function useToolRegistry(): UseToolRegistryResult {
  return { tools: [], isLoading: false }
}

export function NodePanel() {
  const { tools, isLoading } = useToolRegistry()
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const filtered = useMemo(() => {
    if (!search.trim()) return tools
    const q = search.toLowerCase()
    return tools.filter(
      (t) =>
        t.label.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q),
    )
  }, [tools, search])

  const grouped = useMemo(() => {
    const map: Record<string, ToolItem[]> = {}
    for (const tool of filtered) {
      const cat = tool.category || 'Uncategorized'
      if (!map[cat]) map[cat] = []
      map[cat].push(tool)
    }
    return map
  }, [filtered])

  const toggleCategory = useCallback((cat: string) => {
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }))
  }, [])

  const onDragStart = useCallback((e: DragEvent<HTMLDivElement>, tool: ToolItem) => {
    e.dataTransfer.setData('application/starlink-tool', JSON.stringify(tool))
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  return (
    <div className="flex h-full w-64 flex-col border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      {/* Search */}
      <div className="border-b border-gray-200 p-3 dark:border-gray-700">
        <input
          type="text"
          placeholder="Search tools..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm text-gray-800 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
        />
      </div>

      {/* Tool list */}
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading && (
          <p className="px-2 py-4 text-center text-xs text-gray-400">Loading tools...</p>
        )}

        {!isLoading && Object.keys(grouped).length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-gray-400">No tools found</p>
        )}

        {Object.entries(grouped).map(([category, items]) => (
          <div key={category} className="mb-1">
            {/* Category header */}
            <button
              onClick={() => toggleCategory(category)}
              className="flex w-full items-center gap-1 rounded px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              <span
                className="inline-block transition-transform"
                style={{
                  transform: collapsed[category] ? 'rotate(-90deg)' : 'rotate(0deg)',
                }}
              >
                &#9662;
              </span>
              {category}
              <span className="ml-auto text-[10px] font-normal text-gray-400">
                {items.length}
              </span>
            </button>

            {/* Items */}
            {!collapsed[category] && (
              <div className="ml-1 flex flex-col gap-0.5">
                {items.map((tool) => (
                  <div
                    key={tool.name}
                    draggable
                    onDragStart={(e) => onDragStart(e, tool)}
                    className="flex cursor-grab items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 active:cursor-grabbing dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    {tool.icon && <span className="text-xs">{tool.icon}</span>}
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: tool.color ?? '#94a3b8' }}
                    />
                    <span className="truncate">{tool.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
