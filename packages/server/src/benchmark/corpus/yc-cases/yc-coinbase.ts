/**
 * Coinbase (S12) — fintech / consumer + B2B crossover (crypto exchange).
 *
 * Public IPO 2021. Reference for "regulated marketplace where the
 * cost structure is dominated by compliance + custody, not building
 * features."
 */

import type { YcCompanyCase } from './yc-company-schema.js'

export const ycCoinbaseCase: YcCompanyCase = {
  case_id: 'yc-coinbase-2021',
  company_name: 'Coinbase',
  yc_batch: 'S12',
  source_url: 'https://www.ycombinator.com/companies/coinbase',
  fetched_at: '2026-04-27',

  one_liner: 'Buy, sell, and manage cryptocurrency on a regulated US-based exchange.',
  description:
    'Coinbase is a cryptocurrency exchange and platform that lets retail users and institutional investors buy, sell, send, receive, and store dozens of digital assets. Operates a retail app, a pro trading platform (Advanced Trade), an institutional custody business (Coinbase Custody), and a developer platform (Coinbase Cloud / Base L2).',
  website: 'https://coinbase.com',

  sector: 'fintech',
  outcome: 'public',
  stage_at_outcome: 'late-stage',
  outcome_year: 2021,

  ground_truth_bmc: {
    CUSTOMER_SEGMENTS: {
      ground_truth:
        'Three segments: (1) retail crypto buyers (the volume), (2) active traders / pros, (3) institutional investors + corporates needing regulated custody.',
      must_cover: ['retail', 'institutional'],
      must_not_cover: ['developers-only']
    },
    VALUE_PROPOSITIONS: {
      ground_truth:
        'Regulated, US-licensed venue with strong UX for retail; deep liquidity for traders; SOC-2 + insurance-backed custody for institutions. Trust + compliance as the moat (vs. less-regulated overseas exchanges).',
      must_cover: ['regulated', 'trust', 'liquidity'],
      must_not_cover: []
    },
    CHANNELS: {
      ground_truth:
        'Mobile app (largest retail acquisition channel), web platform, paid acquisition, brand / Super Bowl ads, institutional sales for the custody business.',
      must_cover: ['app', 'paid acquisition', 'institutional sales'],
      must_not_cover: []
    },
    CUSTOMER_RELATIONSHIPS: {
      ground_truth:
        'Self-service for retail (with KYC onboarding); 24/7 support; dedicated account management for institutional clients; education content + Coinbase Earn.',
      must_cover: ['self-service', 'kyc', 'institutional'],
      must_not_cover: []
    },
    REVENUE_STREAMS: {
      ground_truth:
        'Transaction fees on retail trades (the largest line, % spread + flat); subscription tier (Coinbase One) reducing trade fees; institutional custody fees; staking commission; interest spread on USDC.',
      must_cover: ['transaction fee', 'spread', 'custody'],
      must_not_cover: ['ads', 'one-time license']
    },
    KEY_RESOURCES: {
      ground_truth:
        'Money transmitter + state licenses (heavy regulatory moat), engineering and security, brand trust, custody infrastructure, listed-asset selection / market-making relationships, Coinbase Cloud + Base L2 stack.',
      must_cover: ['licenses', 'security', 'brand'],
      must_not_cover: []
    },
    KEY_ACTIVITIES: {
      ground_truth:
        'Trading-engine + custody operations, regulatory compliance + KYC/AML across 100+ jurisdictions, security (custody is the #1 operational risk), listing diligence on new assets, building developer platform / L2.',
      must_cover: ['compliance', 'security', 'kyc'],
      must_not_cover: []
    },
    KEY_PARTNERSHIPS: {
      ground_truth:
        'Banking partners for fiat on/off-ramps, blockchain protocols (validator partnerships for staking), KYC providers, insurance underwriters for the custody business, market makers for liquidity.',
      must_cover: ['banks', 'blockchain protocols', 'market makers'],
      must_not_cover: []
    },
    COST_STRUCTURE: {
      ground_truth:
        'Compliance + legal (very large for a regulated exchange), engineering / security headcount, customer support, blockchain transaction / network fees, marketing, insurance + custody losses (rare but catastrophic).',
      must_cover: ['compliance', 'security', 'customer support'],
      must_not_cover: []
    }
  },

  annotator_id: 'sheng-internal',
  annotation_quality: 'draft',
  notes:
    'Tests pipeline on a regulated marketplace. Compliance is the largest cost line — a good BMC must capture this; a generic "exchange" BMC would underweight it.'
}
