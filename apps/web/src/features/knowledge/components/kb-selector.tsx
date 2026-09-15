'use client'

import { Database, FileX } from 'lucide-react'
import type { KnowledgeBaseSummary } from '@/types/knowledge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/shared/components/ui/select'
import { cn } from '@/shared/lib/utils'

export const KB_SELECTOR_NONE_VALUE = '__none__'

type KbSelectorProps = {
  knowledgeBases: KnowledgeBaseSummary[]
  value: string | undefined
  onChange: (kbId: string | undefined) => void
  disabled?: boolean
  className?: string
}

export function KbSelector({
  knowledgeBases,
  value,
  onChange,
  disabled,
  className
}: KbSelectorProps) {
  const handleChange = (next: string) => {
    onChange(next === KB_SELECTOR_NONE_VALUE ? undefined : next)
  }

  const selectValue = value ?? KB_SELECTOR_NONE_VALUE
  const hasKnowledgeBases = knowledgeBases.length > 0

  return (
    <Select value={selectValue} onValueChange={handleChange} disabled={disabled}>
      <SelectTrigger className={cn('h-9 gap-2 text-xs', className)} aria-label="知识库选择">
        <div className="flex items-center gap-2">
          {selectValue === KB_SELECTOR_NONE_VALUE ? (
            <FileX className="h-3.5 w-3.5 text-slate-400" />
          ) : (
            <Database className="h-3.5 w-3.5 text-sky-400" />
          )}
          <SelectValue placeholder="不挂载知识库" />
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={KB_SELECTOR_NONE_VALUE}>
          <span className="flex items-center gap-2">
            <FileX className="h-3.5 w-3.5 text-slate-400" />
            不挂载知识库
          </span>
        </SelectItem>
        {hasKnowledgeBases &&
          knowledgeBases.map((kb) => (
            <SelectItem key={kb.id} value={kb.id}>
              <span className="flex items-center gap-2">
                <Database className="h-3.5 w-3.5 text-sky-400" />
                {kb.name || kb.id.slice(0, 8)}
                {kb.status === 'draft' && (
                  <span className="rounded bg-amber-500/20 px-1 text-[10px] text-amber-300">
                    draft
                  </span>
                )}
              </span>
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  )
}
