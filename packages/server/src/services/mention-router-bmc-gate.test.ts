/**
 * P15 · BMC seed-depth gate unit tests.
 *
 * Live observation: a 28-char seed like
 * "为社区医生开发的 AI 病历摘要工具,本地部署 + 按机构月费"
 * produced 9/9 fabricated BMC cells — CAC, ARR, NPS targets all
 * invented from nothing. assessBmcSeedDepth should refuse these
 * cases and let through realistic deep-context calls.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { assessBmcSeedDepth } from './mention-router.js'

test('assessBmcSeedDepth · empty input refuses', () => {
  const r = assessBmcSeedDepth({ message: '帮我分析市场' })
  assert.equal(r.sufficient, false)
  if (!r.sufficient) {
    assert.ok(r.userChars < 120, `expected < 120 chars, got ${r.userChars}`)
  }
})

test('assessBmcSeedDepth · 28-char seed refuses (the actual repro case)', () => {
  const seed = '为社区医生开发的 AI 病历摘要工具,本地部署 + 按机构月费'
  const r = assessBmcSeedDepth({
    message: '@market-agent 帮我分析市场',
    priorContext: `## 用户先前在本对话里说过的话\n[原始 idea] ${seed}`
  })
  assert.equal(r.sufficient, false, 'thin seed must refuse')
  if (!r.sufficient) {
    assert.ok(r.userChars < 120, `seed only ${r.userChars} chars; below threshold`)
  }
})

test('assessBmcSeedDepth · single long detailed turn proceeds (≥120 chars + concrete detail)', () => {
  const detailedSeed =
    '为社区医生开发的 AI 病历摘要工具,本地部署在诊所服务器,按机构月费 ¥2000-5000,' +
    '目标客群是一线城市连锁社区卫生服务中心和县级医院,团队 3 人,Year-1 目标 50 家机构,' +
    '最大假设: 医生愿意通过机构集采付费'
  const r = assessBmcSeedDepth({
    message: '@market-agent 帮我分析市场',
    priorContext: `## 用户先前在本对话里说过的话\n[原始 idea] ${detailedSeed}`
  })
  assert.equal(r.sufficient, true, 'detailed seed should pass')
})

test('assessBmcSeedDepth · multi-turn shallow conversation proceeds when concrete detail present', () => {
  const r = assessBmcSeedDepth({
    message: '@market-agent 帮我分析市场',
    priorContext: [
      '## 用户先前在本对话里说过的话',
      '[原始 idea] 为社区医生开发的 AI 病历摘要工具',
      '[近期补充 1] 月费 2000 元,目标客群是一线城市社区卫生服务中心',
      '[近期补充 2] 团队 3 人,本地部署在诊所服务器'
    ].join('\n')
  })
  assert.equal(r.sufficient, true, 'multi-turn with numbers + market specifics should pass')
})

test('assessBmcSeedDepth · pure @-mention chains do not count as user turns', () => {
  const r = assessBmcSeedDepth({
    message: '@market-agent 帮我分析',
    priorContext: [
      '## 用户先前',
      '[原始 idea] @market-agent 帮我',
      '[近期补充 1] @critic-agent 看看'
    ].join('\n')
  })
  assert.equal(r.sufficient, false, 'pure @-mentions must not satisfy depth gate')
})

test('assessBmcSeedDepth · 120+ chars single turn without specifics still refuses', () => {
  // Long but vague single turn — no numbers, no concrete client / pricing /
  // team / budget signal. Should refuse because (chars >= 120) AND (turns <
  // 2) AND (no concrete detail) → fails the (turns>=2 OR detail) clause.
  const longButVague = '我想做一个工具帮助一些用户解决一些问题。这个工具可能很有用,我希望能够帮助更多人。我对这个想法很有信心,我相信能够做出一些有价值的东西,改变一些事情。希望能够获得一定的认可,虽然不一定很成功,但至少要尝试一下,毕竟不去试一下永远不知道结果如何。'
  assert.ok(longButVague.length >= 120, `seed must be ≥120 chars; got ${longButVague.length}`)
  const r = assessBmcSeedDepth({
    message: '@market-agent 分析市场',
    priorContext: `## 用户先前\n[原始 idea] ${longButVague}`
  })
  assert.equal(r.sufficient, false, 'long-but-vague single turn should still refuse')
  if (!r.sufficient) {
    assert.match(r.reason, /轮.*表达|具体数字|客群|预算/, 'reason must explain the turn/detail gap')
  }
})
