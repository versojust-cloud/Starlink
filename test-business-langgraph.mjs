#!/usr/bin/env node

import { WebSocket } from 'ws'

const GRAPHQL_URL = 'http://localhost:4000/graphql'
const WS_URL = 'ws://localhost:4000/graphql'

const START_CONVERSATION = `
  mutation StartConversation($workspaceId: ID!, $question: String!) {
    startConversation(workspaceId: $workspaceId, question: $question) {
      metadata {
        id
      }
      graph {
        workspaceId
        nodes {
          id
          type
          position { x y }
          data
        }
        edges {
          id
          source
          target
          label
        }
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

async function testBusinessLangGraph() {
  console.log('🧪 开始测试 Business LangGraph...\n')

  // 1. 发起 startConversation mutation
  console.log('📤 发送 startConversation 请求...')
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: START_CONVERSATION,
      variables: {
        workspaceId: 'test-workspace',
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
  const initialGraph = result.data.startConversation.graph

  console.log(`✅ Conversation 创建成功: ${conversationId}`)
  console.log(`📊 初始节点数: ${initialGraph.nodes.length}`)
  console.log(`🔗 初始边数: ${initialGraph.edges.length}\n`)

  // 2. 订阅 conversationProgress
  console.log('🔌 连接 WebSocket 订阅实时更新...\n')

  const ws = new WebSocket(WS_URL, 'graphql-transport-ws')

  ws.on('open', () => {
    // 发送初始化消息
    ws.send(JSON.stringify({ type: 'connection_init' }))
  })

  let totalNodes = initialGraph.nodes.length
  let totalEdges = initialGraph.edges.length
  let agentAvatarCount = 0
  let ccBmcCardCount = 0
  let insightNoteCount = 0

  ws.on('message', (data) => {
    const message = JSON.parse(data.toString())

    if (message.type === 'connection_ack') {
      console.log('✅ WebSocket 连接已确认')
      // 订阅 conversationProgress
      ws.send(JSON.stringify({
        id: '1',
        type: 'subscribe',
        payload: { query: CONVERSATION_PROGRESS }
      }))
      return
    }

    if (message.type === 'next' && message.payload?.data?.conversationProgress) {
      const event = message.payload.data.conversationProgress

      // 只处理当前 conversation 的事件
      if (event.conversationId !== conversationId) return

      if (event.type === 'graph/appended' && event.payload) {
        console.log('📊 收到完整图更新')
        totalNodes = event.payload.nodes.length
        totalEdges = event.payload.edges.length
      }

      if (event.type === 'graph/diff' && event.payload) {
        if (event.payload.nodes) {
          event.payload.nodes.forEach(node => {
            totalNodes++
            const macraType = node.data?.meta?.macraType

            if (macraType === 'agent-avatar') {
              agentAvatarCount++
              console.log(`🤖 生成 Agent Avatar: ${node.data.title}`)
            } else if (macraType === 'cc-bmc-card') {
              ccBmcCardCount++
              const domain = node.data.meta.domain
              console.log(`📋 生成 CC-BMC 卡片: ${domain} - ${node.data.title}`)
            } else if (macraType === 'insight-note') {
              insightNoteCount++
              console.log(`💡 生成 Insight: ${node.data.title}`)
            } else {
              console.log(`📝 生成节点: ${node.data.title || node.data.type}`)
            }
          })
        }

        if (event.payload.edges) {
          event.payload.edges.forEach(edge => {
            totalEdges++
            console.log(`🔗 生成连接: ${edge.label || '无标签'} (${edge.source} → ${edge.target})`)
          })
        }
      }

      if (event.type === 'status') {
        if (event.status === 'completed') {
          console.log('\n✅ 生成完成！')
          console.log('\n📈 统计结果:')
          console.log(`  - 总节点数: ${totalNodes}`)
          console.log(`  - CC-BMC 卡片: ${ccBmcCardCount}`)
          console.log(`  - Agent Avatar: ${agentAvatarCount}`)
          console.log(`  - Insight 节点: ${insightNoteCount}`)
          console.log(`  - 总边数: ${totalEdges}`)

          // 验证结果
          console.log('\n🔍 验证:')
          if (ccBmcCardCount >= 8) {
            console.log('  ✅ CC-BMC 卡片数量正常（>=8）')
          } else {
            console.log(`  ⚠️  CC-BMC 卡片数量不足（预期>=8，实际${ccBmcCardCount}）`)
          }

          if (agentAvatarCount >= 3) {
            console.log('  ✅ Agent Avatar 数量正常（>=3）')
          } else {
            console.log(`  ⚠️  Agent Avatar 数量不足（预期>=3，实际${agentAvatarCount}）`)
          }

          if (totalEdges >= 5) {
            console.log('  ✅ 边连接数量正常（>=5）')
          } else {
            console.log(`  ⚠️  边连接数量不足（预期>=5，实际${totalEdges}）`)
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

    if (message.type === 'error') {
      console.error('❌ WebSocket 错误:', message.payload)
      ws.close()
      process.exit(1)
    }
  })

  ws.on('error', (error) => {
    console.error('❌ WebSocket 连接错误:', error)
    process.exit(1)
  })

  ws.on('close', () => {
    console.log('\n🔌 WebSocket 连接已关闭')
  })

  // 60秒超时
  setTimeout(() => {
    console.error('\n⏱️  测试超时（60秒）')
    ws.close()
    process.exit(1)
  }, 60000)
}

testBusinessLangGraph().catch(error => {
  console.error('❌ 测试失败:', error)
  process.exit(1)
})
