/**
 * 测试翻译 API
 */

const BASE_URL = 'http://localhost:3000'

async function testTranslate() {
  console.log('🧪 测试多语言翻译 API...\n')

  const tests = [
    {
      name: '标准翻译（英→中）',
      endpoint: '/api/translate',
      payload: {
        text: 'Hello, how are you today? I hope you are doing well.',
        targetLanguage: 'zh-CN',
        mode: 'standard'
      }
    },
    {
      name: '正式语气（中→英）',
      endpoint: '/api/translate',
      payload: {
        text: '我们需要在本季度完成产品发布，请各部门配合。',
        sourceLanguage: 'zh-CN',
        targetLanguage: 'en',
        mode: 'formal'
      }
    },
    {
      name: '口语化翻译',
      endpoint: '/api/translate',
      payload: {
        text: '今天天气真好啊！我们一起出去玩吧！',
        targetLanguage: 'en',
        mode: 'casual'
      }
    }
  ]

  for (const test of tests) {
    console.log(`📝 ${test.name}`)
    console.log(`   输入: ${test.payload.text}`)

    try {
      const response = await fetch(`${BASE_URL}${test.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(test.payload)
      })

      if (!response.ok) {
        console.log(`   ❌ 失败: ${response.status} ${response.statusText}\n`)
        continue
      }

      const data = await response.json()
      console.log(`   ✅ 输出: ${data.translation}\n`)
    } catch (error) {
      console.log(`   ❌ 错误: ${error}\n`)
    }
  }
}

async function testConversion() {
  console.log('\n🔄 测试繁简转换 API...\n')

  const tests = [
    {
      name: '简体→繁体',
      payload: {
        text: '我们需要在本季度完成产品发布，这是一个重要的里程碑。网络技术的发展给我们带来了新的机遇。',
        mode: 'simplified-traditional'
      }
    },
    {
      name: '繁体→简体',
      payload: {
        text: '臺灣的網絡技術發展迅速，許多創新應用在這裡誕生。數據顯示，互聯網用戶數量持續增長。',
        mode: 'traditional-simplified'
      }
    }
  ]

  for (const test of tests) {
    console.log(`📝 ${test.name}`)
    console.log(`   输入: ${test.payload.text}`)

    try {
      const response = await fetch(`${BASE_URL}/api/translate/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(test.payload)
      })

      if (!response.ok) {
        console.log(`   ❌ 失败: ${response.status} ${response.statusText}\n`)
        continue
      }

      const data = await response.json()
      console.log(`   ✅ 输出: ${data.translation}\n`)
    } catch (error) {
      console.log(`   ❌ 错误: ${error}\n`)
    }
  }
}

async function main() {
  try {
    await testTranslate()
    await testConversion()
    console.log('✅ 所有测试完成!')
  } catch (error) {
    console.error('\n❌ 测试失败:')
    console.error(error)
  }
}

main()
