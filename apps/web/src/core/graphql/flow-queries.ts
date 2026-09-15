import { gql } from 'graphql-request'

/* ---------- queries ---------- */

export const AVAILABLE_TOOLS_QUERY = gql`
  query AvailableTools {
    availableTools {
      name
      label
      description
      category
      icon
      color
      inputSchema
      outputSchema
      inputPorts {
        name
        type
        description
        required
      }
      outputPorts {
        name
        type
        description
        required
      }
      runtime {
        timeout
        retries
        cacheable
        streamable
        parallel
      }
    }
  }
`

export const FLOWS_QUERY = gql`
  query Flows($workspaceId: ID!) {
    flows(workspaceId: $workspaceId) {
      id
      name
      description
      status
      createdAt
      updatedAt
      nodeCount
      edgeCount
    }
  }
`

export const FLOW_QUERY = gql`
  query Flow($id: ID!) {
    flow(id: $id) {
      id
      name
      description
      status
      definition {
        nodes
        edges
      }
      createdAt
      updatedAt
    }
  }
`

export const FLOW_EXECUTION_QUERY = gql`
  query FlowExecution($executionId: ID!) {
    flowExecution(id: $executionId) {
      id
      flowId
      status
      startedAt
      completedAt
      nodeResults {
        nodeId
        status
        output
        error
        duration
      }
    }
  }
`

/* ---------- mutations ---------- */

export const CREATE_FLOW_MUTATION = gql`
  mutation CreateFlow($input: CreateFlowInput!) {
    createFlow(input: $input) {
      id
      name
      description
      status
      createdAt
    }
  }
`

export const UPDATE_FLOW_MUTATION = gql`
  mutation UpdateFlow($id: ID!, $input: UpdateFlowInput!) {
    updateFlow(id: $id, input: $input) {
      id
      name
      description
      status
      definition {
        nodes
        edges
      }
      updatedAt
    }
  }
`

export const DELETE_FLOW_MUTATION = gql`
  mutation DeleteFlow($id: ID!) {
    deleteFlow(id: $id) {
      id
    }
  }
`

export const EXECUTE_FLOW_MUTATION = gql`
  mutation ExecuteFlow($flowId: ID!, $inputs: JSON) {
    executeFlow(flowId: $flowId, inputs: $inputs) {
      executionId
      status
    }
  }
`

/* ---------- subscriptions ---------- */

export const FLOW_EXECUTION_PROGRESS_SUBSCRIPTION = gql`
  subscription FlowExecutionProgress($executionId: ID!) {
    flowExecutionProgress(executionId: $executionId) {
      executionId
      nodeId
      status
      output
      error
      duration
      progress
      progressMessage
    }
  }
`
