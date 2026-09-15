import { QueryClient } from '@tanstack/react-query'

let queryClient: QueryClient | null = null

export function getQueryClient() {
  if (!queryClient) {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          refetchOnWindowFocus: false,
          staleTime: 30_000
        }
      }
    })
  }
  return queryClient
}

