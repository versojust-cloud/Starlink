#!/usr/bin/env node

import { WebSocket } from 'ws'

const GRAPHQL_URL = 'http://localhost:4000/graphql'
const WS_URL = 'ws://localhost:4000/graphql'

const START_CONVERSATION = `
  mutation StartConversation($workspaceId: ID!, $question: String!) {
    startConversation(workspaceId: $workspaceId, question: $question) {
      metadata { id }
      graph {
        workspaceId
        nodes { id type position { x y } data }
        edges { id source target label }
      }
    }
  }
`

const CONVERSATION_PROGRESS = `
  subscription ConversationProgress {
    conversationProgress {
      type
      conversationId
      status
      message
      payload
    }
  }
`

const EXPECTED_DOMAINS = [
  '客户细分',
  '客户关系',
  '渠道通路',
  '价值主张',
  '收入来源',
  '关键业务',
  '核心资源',
  '重要合作',
  '成本结构'
]

async function test9Agents() {
  console.log('🧪 测试 9 个独立 Agent 架构...\n')

  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: START_CONVERSATION,
      variables: {
        workspaceId: 'test-9-agents',
        question: '帮我分析新能源汽车市场的商业模式'
      }
    })
  })

  const result = await response.json()

  if (result.errors) {
    console.error('❌ GraphQL 错误:', JSON.stringify(result.errors, null, 2))
    return
  }

  const conversationId = result.data.startConversation.metadata.id
  console.log(`✅ Conversation ID: ${conversationId}\n`)

  const ws = new WebSocket(WS_URL, 'graphql-transport-ws')

  const domainCounts = {}
  EXPECTED_DOMAINS.forEach(d => domainCounts[d] = 0)

  let agentAvatarCount = 0
  let totalNodes = result.data.startConversation.graph?.nodes?.length || 0
  let totalEdges = result.data.startConversation.graph?.edges?.length || 0

  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'connection_init' }))
  })

  ws.on('message', (data) => {
    const message = JSON.parse(data.toString())

    if (message.type === 'connection_ack') {
      console.log('✅ WebSocket 已连接\n')
      ws.send(JSON.stringify({
        id: '1',
        type: 'subscribe',
        payload: { query: CONVERSATION_PROGRESS }
      }))
      return
    }

    if (message.type === 'next' && message.payload?.data?.conversationProgress) {
      const event = message.payload.data.conversationProgress

      if (event.conversationId !== conversationId) return

      if (event.type === 'graph/diff' && event.payload) {
        if (event.payload.nodes) {
          event.payload.nodes.forEach(node => {
            totalNodes++
            const macraType = node.data?.meta?.macraType
            const domain = node.data?.meta?.domain

            if (macraType === 'agent-avatar') {
              agentAvatarCount++
              console.log(`🤖 Agent Avatar ${agentAvatarCount}: ${node.data.title}`)
            } else if (macraType === 'cc-bmc-card' && domain) {
              if (domainCounts[domain] !== undefined) {
                domainCounts[domain]++
                console.log(`📋 [${domain}] ${node.data.title}`)
              }
            } else if (macraType === 'insight-note') {
              console.log(`💡 ${node.data.title}`)
            }
          })
        }

        if (event.payload.edges) {
          totalEdges += event.payload.edges.length
        }
      }

      if (event.type === 'status') {
        if (event.status === 'completed') {
          console.log('\n✅ 生成完成！\n')
          console.log('📊 统计结果:')
          console.log(`  总节点数: ${totalNodes}`)
          console.log(`  总边数: ${totalEdges}`)
          console.log(`  Agent Avatar 数: ${agentAvatarCount}\n`)

          console.log('📋 各维度卡片数量:')
          let allDomainsPresent = true
          EXPECTED_DOMAINS.forEach(domain => {
            const count = domainCounts[domain]
            const status = count > 0 ? '✅' : '❌'
            console.log(`  ${status} ${domain}: ${count}`)
            if (count === 0) allDomainsPresent = false
          })

          console.log('\n🔍 验证结果:')
          if (allDomainsPresent) {
            console.log('  ✅ 所有 9 个维度都已生成')
          } else {
            console.log('  ⚠️  部分维度缺失')
          }

          if (agentAvatarCount >= 9) {
            console.log('  ✅ Agent Avatar 数量正常 (>=9)')
          } else {
            console.log(`  ⚠️  Agent Avatar 数量不足 (${agentAvatarCount}/9)`)
          }

          if (totalEdges >= 8) {
            console.log('  ✅ 边连接数量正常 (>=8)')
          } else {
            console.log(`  ⚠️  边连接数量不足 (${totalEdges}/8)`)
          }

          ws.close()
          process.exit(0)
        }

        if (event.status === 'failed') {
          console.error(`\n❌ 生成失败: ${event.message}`)
          ws.close()
          process.exit(1)
        }
      }
    }
  })

  ws.on('error', (error) => {
    console.error('❌ WebSocket 错误:', error)
    process.exit(1)
  })

  setTimeout(() => {
    console.error('\n⏱️  测试超时（60秒）')
    ws.close()
    process.exit(1)
  }, 60000)
}

test9Agents().catch(error => {
  console.error('❌ 测试失败:', error)
  process.exit(1)
})
