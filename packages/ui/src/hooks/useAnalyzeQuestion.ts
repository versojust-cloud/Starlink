'use client'

import { useMutation } from '@tanstack/react-query'
import type { UseMutationOptions, UseMutationResult } from '@tanstack/react-query'
import type { AnalyzeRequest, AnalyzeResponse } from '../types.js'

export type UseAnalyzeQuestionOptions = {
  endpoint?: string
  fetchImpl?: typeof fetch
  mutationOptions?: UseMutationOptions<AnalyzeResponse, Error, AnalyzeRequest, unknown>
}

async function requestAnalysis(
  endpoint: string,
  payload: AnalyzeRequest,
  fetchImpl: typeof fetch
): Promise<AnalyzeResponse> {
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || '分析服务返回错误')
  }

  const data = (await response.json()) as AnalyzeResponse
  return data
}

export function useAnalyzeQuestion(
  options: UseAnalyzeQuestionOptions = {}
): UseMutationResult<AnalyzeResponse, Error, AnalyzeRequest, unknown> {
  const { endpoint = '/api/analyze', fetchImpl = fetch, mutationOptions } = options

  return useMutation<AnalyzeResponse, Error, AnalyzeRequest>({
    mutationFn: (payload) => requestAnalysis(endpoint, payload, fetchImpl),
    ...mutationOptions
  })
}
