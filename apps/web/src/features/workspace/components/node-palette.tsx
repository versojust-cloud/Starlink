'use client'

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { REACT_FLOW_DRAG_TYPE } from '@/shared/lib/drag-constants'

const paletteGroups = [
  {
    title: '知识节点',
    items: [
      { id: 'note', label: '笔记节点', description: '富文本笔记，可@引用资料' },
      { id: 'document', label: '文档摘要', description: '解析文档后生成的节点' },
      { id: 'reference', label: '引用卡片', description: '对文档片段的索引' }
    ]
  },
  {
    title: '行动节点',
    items: [
      { id: 'task', label: '任务', description: '分配责任与截止日期' },
      { id: 'outline', label: 'AI 大纲', description: '自动生成结构列表' }
    ]
  },
  {
    title: '媒体节点',
    items: [
      { id: 'image', label: '图像', description: '上传或抓取的图片' },
      { id: 'web', label: '网页卡片', description: '网页内容快照' }
    ]
  }
]

export function NodePalette() {
  const [openGroup, setOpenGroup] = useState<string | null>('知识节点')
  const [search, setSearch] = useState('')

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return paletteGroups
    return paletteGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          `${item.label}${item.description}`.toLowerCase().includes(search.toLowerCase())
        )
      }))
      .filter((group) => group.items.length > 0)
  }, [search])

  return (
    <div
      className="pointer-events-auto w-72 rounded-3xl border border-canvas-border bg-canvas-surface/95 p-4 text-canvas-text shadow-xl backdrop-blur"
      data-testid="node-palette"
    >
      <header className="space-y-2">
        <h2 className="text-sm font-semibold text-canvas-text">节点库</h2>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="搜索节点或模板…"
          className="w-full rounded-xl border border-canvas-border bg-canvas-panel px-3 py-2 text-xs text-canvas-muted outline-none placeholder:text-canvas-subtle focus:border-canvas-primary/60 focus:ring-2 focus:ring-canvas-primary/20"
        />
      </header>
      <div className="mt-4 space-y-3">
        {filteredGroups.map((group) => (
          <div key={group.title} className="rounded-2xl border border-canvas-border bg-canvas-surface/80">
            <button
              className="flex w-full items-center justify-between rounded-2xl bg-canvas-panel px-3 py-2 text-left text-xs font-medium text-canvas-text transition hover:bg-canvas-panel/80"
              onClick={() => setOpenGroup((current) => (current === group.title ? null : group.title))}
              type="button"
            >
              {group.title}
              <span className="text-canvas-subtle">{openGroup === group.title ? '−' : '+'}</span>
            </button>
            <AnimatePresence initial={false}>
              {openGroup === group.title && (
                <motion.ul
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="space-y-1 overflow-hidden px-3 py-2"
                >
                  {group.items.map((item) => {
                    const draggable = ['note', 'document', 'task', 'reference'].includes(item.id)
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          draggable={draggable}
                          onDragStart={(event) => {
                            if (!draggable) return
                            event.dataTransfer.setData(REACT_FLOW_DRAG_TYPE, item.id)
                            event.dataTransfer.effectAllowed = 'move'
                          }}
                          className="w-full rounded-xl px-3 py-2 text-left text-xs text-canvas-muted transition hover:bg-canvas-panel"
                          data-testid={`palette-item-${item.id}`}
                        >
                          <div className="flex items-center justify-between">
                            <p className="font-medium">{item.label}</p>
                            {!draggable && <span className="text-[10px] text-canvas-subtle">即将上线</span>}
                          </div>
                          <p className="mt-1 text-[11px] text-canvas-subtle">{item.description}</p>
                        </button>
                      </li>
                    )
                  })}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  )
}
