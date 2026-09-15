/**
 * P11.18 · Seed 2 additional KBs for the hybrid retrieval benchmark.
 *
 * Goal: give `eval:rag-hybrid-compare` enough content surface to show
 * a real difference between pure-vector vs hybrid retrieval. The
 * existing coffee-B2B KB has only 2 chunks, which is too small for
 * lexical matching to differentiate.
 *
 * Adds:
 *   - "SaaS Pricing Strategies" (English-leaning, exact-term-heavy)
 *   - "硬件产品出海合规清单" (Chinese-leaning, named-entity-heavy)
 *
 * Both seeded with 4-6 paragraphs each so chunking creates 4-8 chunks
 * per KB. After seeding, `kb:reembed --all` to populate vectors.
 */

import { nanoid } from 'nanoid'
import { pool } from '../infrastructure/db/pool.js'
import { getKbStore } from '../application/kb-store.js'

const KB_SAAS = {
  id: 'kb-bench-saas-pricing',
  workspaceId: 'bench-ws-saas',
  name: 'SaaS 定价策略 · benchmark KB',
  ownerUserId: 'bench-owner',
  visibility: 'global'
}

const KB_HW = {
  id: 'kb-bench-hardware-export',
  workspaceId: 'bench-ws-hw',
  name: '硬件出海合规 · benchmark KB',
  ownerUserId: 'bench-owner',
  visibility: 'global'
}

const SAAS_DOC_1 = {
  id: 'doc-saas-pricing-tiers-2024',
  title: 'SaaS Pricing Tiers — 2024 industry survey',
  content: `# Pricing Tier Architecture for B2B SaaS · 2024

## Three-tier vs Five-tier
Most SaaS companies converge on a 3-tier structure: Starter, Pro, Enterprise.
A 2024 SaaStr survey of 2,847 companies found that 5-tier offerings produce
12% higher LTV but 8% lower conversion at the top of funnel — net only
recommended for companies with > 1,500 distinct features to monetize.

## Stripe pricing model breakdown
Stripe famously uses a transparent transaction-fee model: 2.9% + $0.30 per
charge. This works because their primary metric (charge volume) scales
linearly with customer success. Direct seat-based pricing collapses
incentives.

## Per-seat vs usage-based
Per-seat pricing dominated 2010-2018; usage-based (Snowflake, Twilio,
Datadog) dominated 2018-2024. Hybrid models like Notion's "free for 10
guests then per-seat" capture the best of both — virality plus margin.

## Annual contract value (ACV) and discount tiers
Industry standard: 10% off annual prepay, 20% off 2-year, 30% off 3-year.
Beyond 30% the customer perceives the contract as a sunk-cost bet rather
than a discount. Anchor pricing works only when the highest tier is
visibly used by 1-2% of customers — otherwise the anchor signals
unrealistic.

## Free tier conversion benchmarks
Median free→paid conversion for B2B SaaS in 2024: 2-4%. Top quartile:
6-8%. Notion's reported number is 4.2%. Free tier should cap usage on
the dimension most correlated with paid value (storage, seats, API
calls), not feature count.`
}

const SAAS_DOC_2 = {
  id: 'doc-saas-churn-strategies-2024',
  title: 'Reducing Churn in B2B SaaS',
  content: `# Anti-Churn Tactics · 2024 playbook

## Net Revenue Retention (NRR) as the KPI
NRR > 110% means the company grows even with zero new sales. Top SaaS
companies (Snowflake, Datadog, Atlassian) report NRR > 130%. Below 100%
is a leaky bucket — fix retention before scaling acquisition.

## Onboarding completion rate
First 14 days predict 90% of churn. Companies with > 70% onboarding
completion show 3x higher 12-month retention vs < 40% completion.
"Aha moment" identification is critical: instrument the moment that
correlates with retention (Slack: "first message sent", Figma: "first
file shared").

## Account health scoring
Common signals: login frequency decay, feature breadth narrowing, support
ticket sentiment. Predictive models with > 0.7 AUC catch 60-70% of
at-risk accounts 30-60 days before churn — enough lead time for CSM
intervention.

## Expansion vs new logo
For SaaS with NRR > 100%, expanding existing accounts is 5-7x cheaper
than acquiring new logos. This shifts marketing budget toward customer
success and inside sales rather than top-of-funnel.`
}

const HW_DOC_1 = {
  id: 'doc-hw-ce-fcc-2024',
  title: '硬件出海 CE / FCC 认证清单',
  content: `# 硬件产品出海合规清单 · 欧美篇

## 欧盟 CE 认证范围
CE 标志覆盖电子电气产品、医疗器械、玩具、机械、个人防护装备。无线设备
还需走 RED 指令（Radio Equipment Directive 2014/53/EU），EMC 指令
（电磁兼容性）+ LVD 指令（低电压指令 50V-1000V AC / 75V-1500V DC）。

## 美国 FCC 认证差异
FCC Part 15 Subpart B 涵盖意外辐射体（计算机外设），Subpart C 涵盖故意
辐射体（无线设备）。Wi-Fi / 蓝牙 设备需要 FCC ID 注册，且 SAR 测试是
近距离设备（手机、TWS 耳机）的硬指标。

## 中国与欧美的电池法规分歧
欧盟 2023/1542 新电池法规要求 2027 年起所有便携电池可移除可更换 — 影响
所有 Apple Lightning / USB-C 集成电池产品。FCC 接受 UN38.3 测试报告即
可，但 PSE （日本）要求额外 JIS 标准。

## 数据合规 — GDPR + CCPA
任何收集用户数据的硬件（智能音箱、摄像头、可穿戴）必须支持：用户数据
导出（GDPR 第 20 条）、删除请求（第 17 条）、最小化原则（第 5 条）。
CCPA 比 GDPR 宽松但仍要求 opt-out 机制 + 数据处理透明。

## 通关代理与 ITC 案例
ITC（美国国际贸易委员会）337 调查是中国硬件公司最高风险点 — 2023 年
华为、小米、字节跳动各受过 1+ 起。委托美国本土代理人申报 + 早期专利
扫描可降低 60% 触发概率。`
}

async function seedKbDefinition(kb: typeof KB_SAAS): Promise<void> {
  await pool.query(
    `INSERT INTO kb_definitions (
       id, workspace_id, name, status, owner_user_id, visibility, created_at, updated_at
     ) VALUES ($1, $2, $3, 'published', $4, $5, now(), now())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       status = EXCLUDED.status,
       owner_user_id = EXCLUDED.owner_user_id,
       visibility = EXCLUDED.visibility,
       updated_at = now()`,
    [kb.id, kb.workspaceId, kb.name, kb.ownerUserId, kb.visibility]
  )
}

async function main() {
  // Make sure KB definitions exist (kb_documents has FK pattern via kb_id).
  await seedKbDefinition(KB_SAAS)
  await seedKbDefinition(KB_HW)

  const store = getKbStore()
  // Seed SaaS docs
  for (const doc of [SAAS_DOC_1, SAAS_DOC_2]) {
    const r = await store.addDocument({
      kbId: KB_SAAS.id,
      workspaceId: KB_SAAS.workspaceId,
      title: doc.title,
      content: doc.content,
      contentType: 'text/markdown',
      docId: doc.id,
      metadata: { seedSource: 'rag-benchmark', addedAt: new Date().toISOString() }
    })
    console.log(`[seed] ${KB_SAAS.id} / ${doc.id} → ${r.chunkCount} chunks`)
  }
  // Seed HW docs
  for (const doc of [HW_DOC_1]) {
    const r = await store.addDocument({
      kbId: KB_HW.id,
      workspaceId: KB_HW.workspaceId,
      title: doc.title,
      content: doc.content,
      contentType: 'text/markdown',
      docId: doc.id,
      metadata: { seedSource: 'rag-benchmark', addedAt: new Date().toISOString() }
    })
    console.log(`[seed] ${KB_HW.id} / ${doc.id} → ${r.chunkCount} chunks`)
  }
  await pool.end()
}

await main()
