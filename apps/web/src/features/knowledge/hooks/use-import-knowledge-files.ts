'use client'

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { knowledgeKeys, taskKeys } from '@/core/query/keys'
import { getGatewayBaseUrl } from '@/shared/lib/graphql-client'
import type { KnowledgeTask } from '@/types/knowledge'

type FileImportResponse = {
  tasks?: KnowledgeTask[]
}

type ImportKnowledgeFilesVariables = {
  kbId: string
  files: File[]
  onProgress?: (percentage: number) => void
  retryCount?: number
}

const DEFAULT_RETRY_COUNT = 2

function uploadKnowledgeFiles({
  workspaceId,
  kbId,
  files,
  onProgress
}: {
  workspaceId: string
  kbId: string
  files: File[]
  onProgress?: (percentage: number) => void
}) {
  return new Promise<KnowledgeTask[]>((resolve, reject) => {
    const endpoint = `${getGatewayBaseUrl()}/kb/${kbId}/import/file?workspaceId=${encodeURIComponent(workspaceId)}`
    const formData = new FormData()
    files.forEach((file) => {
      formData.append('files', file)
    })

    const request = new XMLHttpRequest()
    request.open('POST', endpoint)
    request.responseType = 'text'

    request.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable || event.total <= 0) return
      const percentage = Math.min(100, Math.round((event.loaded / event.total) * 100))
      onProgress(percentage)
    }

    request.onerror = () => {
      reject(new Error('Failed to import files: network request failed'))
    }

    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(`Failed to import files: ${request.status} ${request.statusText}`))
        return
      }

      try {
        const payload = JSON.parse(request.responseText) as FileImportResponse
        onProgress?.(100)
        resolve(payload.tasks ?? [])
      } catch (error) {
        reject(new Error(`Failed to parse file import response: ${String(error)}`))
      }
    }

    request.send(formData)
  })
}

export function useImportKnowledgeFiles(workspaceId: string): UseMutationResult<
  KnowledgeTask[],
  Error,
  ImportKnowledgeFilesVariables
> {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ kbId, files, onProgress, retryCount }) => {
      const retries = Math.max(0, retryCount ?? DEFAULT_RETRY_COUNT)
      let lastError: Error | null = null

      for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
          return await uploadKnowledgeFiles({ workspaceId, kbId, files, onProgress })
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error))
          if (attempt === retries) {
            throw lastError
          }
          await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 500))
        }
      }

      throw lastError ?? new Error('Failed to import files')
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: taskKeys.byKnowledgeBase(workspaceId, variables.kbId) })
      await queryClient.invalidateQueries({ queryKey: knowledgeKeys.status(workspaceId, variables.kbId) })
    }
  })
}
