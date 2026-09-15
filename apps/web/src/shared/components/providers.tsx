'use client'

import { ReactNode, useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { getQueryClient } from '../lib/query-client'

type ProvidersProps = {
  children: ReactNode
}

export function Providers({ children }: ProvidersProps) {
  const [client] = useState(() => getQueryClient())

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
