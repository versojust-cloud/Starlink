'use client'

/**
 * 冲突标记覆盖层 — 显示在有高危冲突的 BMC 格子角落。
 */

interface ConflictOverlayProps {
  count: number
}

export function ConflictOverlay({ count }: ConflictOverlayProps) {
  return (
    <div className="absolute -top-1 -right-1 flex items-center justify-center w-5 h-5 bg-red-500 rounded-full text-[10px] font-bold text-white shadow-lg animate-pulse">
      {count}
    </div>
  )
}
