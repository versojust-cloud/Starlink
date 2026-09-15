/**
 * GraphQL Subscription infrastructure for real-time execution progress.
 */

import { PubSub } from 'graphql-subscriptions'
import type { ExecutionEvent } from '@starlink/shared'

export const pubsub = new PubSub()

export const FLOW_EXECUTION_PROGRESS = 'FLOW_EXECUTION_PROGRESS'

export function publishExecutionEvent(executionId: string, event: ExecutionEvent): void {
  void pubsub.publish(FLOW_EXECUTION_PROGRESS, {
    flowExecutionProgress: { executionId, ...event },
  })
}
