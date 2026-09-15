import { z } from 'zod'

export const ccBmcDomainSchema = z.enum([
  '客户细分',
  '客户关系',
  '渠道通路',
  '价值主张',
  '收入来源',
  '关键业务',
  '核心资源',
  '重要合作',
  '成本结构'
])

export const ccBmcDomains = ccBmcDomainSchema.options

export const bmcAgentSignatureSchema = z.enum([
  'Market_Agent',
  'Product_Agent',
  'Finance_Agent',
  'Compliance_Agent',
  'Orchestrator',
  'Adversarial_Critic'
])

export const bmcConfidenceSchema = z.enum(['high', 'medium', 'low'])

export const bmcCompactCardContextSchema = z.object({
  id: z.string(),
  domain: ccBmcDomainSchema.optional(),
  label: z.string(),
  agentSignature: bmcAgentSignatureSchema.optional(),
  confidence: bmcConfidenceSchema.optional(),
  keyClaims: z.array(z.string()).max(5),
  assumptions: z.array(z.string()).max(3).default([]),
  risks: z.array(z.string()).max(3).default([]),
  evidenceRefs: z.array(z.string()).max(8).default([])
})

export const bmcCompactContextSchema = z.object({
  cards: z.array(bmcCompactCardContextSchema),
  notes: z.array(z.string()).default([])
})

export const bmcAnalysisCardSchema = z.object({
  domain: ccBmcDomainSchema,
  /**
   * One-line conclusion (≤60 chars). Surfaces as the BMC card title and
   * the drawer "摘要" section. Optional for back-compat with older agent
   * outputs that only emit content; the drawer derives summary from
   * content's first sentence when missing.
   */
  // P11.2 · 120 was too tight (originally for one-line summary).
  // New spec: summary is a condensed markdown 段 / 短列表 covering all
  // key points, 80-200 字 + markdown overhead → cap at 600.
  summary: z.string().max(600).optional(),
  /**
   * Detailed analysis (3-6 paragraphs / 200-600 chars). Drawer's full
   * detail section. May be empty when the agent only has a 1-sentence
   * answer (then summary holds the result, content stays "").
   */
  content: z.string(),
  confidence: z.number().min(0).max(1)
}).refine(
  (card) => (card.summary && card.summary.trim().length > 0) || card.content.trim().length > 0,
  { message: 'card must have either summary or content (both empty is invalid)' }
)

export const bmcAnalysisSchema = z.object({
  bmcCards: z.array(bmcAnalysisCardSchema)
})

export type CcBmcDomain = z.infer<typeof ccBmcDomainSchema>
export type BmcAgentSignature = z.infer<typeof bmcAgentSignatureSchema>
export type BmcCompactCardContext = z.infer<typeof bmcCompactCardContextSchema>
export type BmcCompactContext = z.infer<typeof bmcCompactContextSchema>
export type BmcAnalysisCard = z.infer<typeof bmcAnalysisCardSchema>
export type BmcAnalysis = z.infer<typeof bmcAnalysisSchema>
