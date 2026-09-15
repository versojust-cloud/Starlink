'use client'

import Image from 'next/image'
import { memo, useCallback, useState } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import { Card, CardHeader, CardTitle, CardContent } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { useComfyStore } from '../../store'
import { FileIcon, Upload } from 'lucide-react'

export const ResourceNode = memo(function ResourceNode({ id }: NodeProps) {
  const updateNodeData = useComfyStore((state) => state.updateNodeData)
  const nodeData = useComfyStore((state) => state.nodeDataMap.get(id))
  const [isDragging, setIsDragging] = useState(false)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const file = e.dataTransfer.files[0]
    if (!file) return

    const isImage = file.type.startsWith('image/')

    updateNodeData(id, {
      resourceContent: file,
      resourceType: isImage ? 'image' : 'document',
      resourceName: file.name,
      status: 'done'
    })
  }, [id, updateNodeData])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const isImage = file.type.startsWith('image/')

    updateNodeData(id, {
      resourceContent: file,
      resourceType: isImage ? 'image' : 'document',
      resourceName: file.name,
      status: 'done'
    })
  }, [id, updateNodeData])

  return (
    <>
      <Card className="w-80 overflow-hidden rounded-xl border border-white/[0.08] bg-slate-900/60 backdrop-blur-xl transition-colors hover:border-white/[0.16]">
        <CardHeader className="border-b border-white/[0.06] bg-violet-400/[0.06] pb-3">
          <CardTitle className="flex items-center gap-2 text-[13px] font-semibold text-white">
            <FileIcon className="h-4 w-4 text-violet-300" strokeWidth={1.75} />
            资源节点
            {nodeData?.status === 'done' && (
              <Badge variant="success" className="ml-auto bg-emerald-400/15 text-emerald-300 border-emerald-400/30">
                已就绪
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {!nodeData?.resourceContent ? (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`cursor-pointer rounded-md border border-dashed p-5 text-center transition-colors ${
                isDragging
                  ? 'border-violet-300/50 bg-violet-400/10'
                  : 'border-white/[0.10] bg-slate-950/30 hover:border-white/[0.18] hover:bg-slate-950/50'
              }`}
            >
              <input
                type="file"
                id={`file-input-${id}`}
                className="hidden"
                onChange={handleFileInput}
                accept="image/*,.pdf,.txt,.md,.doc,.docx"
              />
              <label htmlFor={`file-input-${id}`} className="cursor-pointer">
                <Upload className="mx-auto mb-2 h-6 w-6 text-violet-300" strokeWidth={1.75} />
                <p className="text-[12px] font-medium text-slate-200">拖放文件或点击上传</p>
                <p className="mt-0.5 text-[11px] text-slate-500">支持图片和文档</p>
              </label>
            </div>
          ) : (
            <div className="space-y-2">
              {nodeData.resourceType === 'image' && nodeData.resourceContent instanceof File ? (
                <div className="overflow-hidden rounded-md border border-white/[0.06]">
                  <Image
                    src={URL.createObjectURL(nodeData.resourceContent)}
                    alt="Preview"
                    width={640}
                    height={256}
                    className="h-32 w-full object-cover"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-md border border-white/[0.06] bg-slate-950/40 p-3">
                  <FileIcon className="h-5 w-5 text-violet-300" strokeWidth={1.75} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium text-slate-200">
                      {nodeData.resourceName}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {nodeData.resourceContent instanceof File
                        ? `${(nodeData.resourceContent.size / 1024).toFixed(1)} KB`
                        : 'File'}
                    </p>
                  </div>
                </div>
              )}
              <button
                onClick={() =>
                  updateNodeData(id, { resourceContent: undefined, status: 'idle' })
                }
                className="w-full rounded-md py-1 text-[11px] text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-white"
              >
                清除
              </button>
            </div>
          )}
        </CardContent>
        <Handle
          type="source"
          position={Position.Right}
          className="h-2.5 w-2.5 rounded-full border-2 border-slate-950 bg-violet-400"
        />
      </Card>
    </>
  )
})
