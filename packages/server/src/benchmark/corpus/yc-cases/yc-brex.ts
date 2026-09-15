/**
 * Brex (W17) — fintech / corporate cards.
 *
 * Reference for vertical-specialised corporate-card + spend-management
 * fintech (originally underwriting startups based on cash balances
 * rather than personal-credit history). Tests the pipeline on a
 * fintech that is *not* Stripe-like API tooling.
 */

import type { YcCompanyCase } from './yc-company-schema.js'

export const ycBrexCase: YcCompanyCase = {
  case_id: 'yc-brex-2024',
  company_name: 'Brex',
  yc_batch: 'W17',
  source_url: 'https://www.ycombinator.com/companies/brex',
  fetched_at: '2026-04-28',

  one_liner: 'Corporate cards, banking, and spend management for startups and growing companies.',
  description:
    'Brex provides corporate credit cards, business accounts, expense management, bill pay, and travel for venture-backed startups and growing companies. Originally won the startup market by underwriting on cash balance instead of personal credit, removing personal-guarantee friction; has since expanded into a unified spend-management platform with software (Brex Empower), expense controls, and accounting integrations.',
  website: 'https://brex.com',

  sector: 'fintech',
  outcome: 'active',
  stage_at_outcome: 'series-b-plus',
  outcome_year: 2024,

  ground_truth_bmc: {
    CUSTOMER_SEGMENTS: {
      ground_truth:
        'Venture-backed startups (initial wedge — Series A through pre-IPO), then growing private companies and mid-market enterprises; CFO + finance-ops + founder personas. Brand specifically targets companies that find consumer-style corporate cards and personal-guarantee constraints painful.',
      must_cover: ['startups', 'CFO', 'finance teams'],
      must_not_cover: ['consumers']
    },
    VALUE_PROPOSITIONS: {
      ground_truth:
        'No personal-guarantee corporate cards underwritten on cash balance + projections; integrated software for expenses, bill pay, travel, and accounting close; higher rewards optimised for startup spend categories (AWS, ads).',
      must_cover: ['no personal guarantee', 'spend management', 'integrated software'],
      must_not_cover: ['consumer rewards card']
    },
    CHANNELS: {
      ground_truth:
        'Direct sales + self-serve sign-up, content marketing (CFO blog, founder community), partnerships with VCs / accelerators / startup ecosystems (YC partnership), referral programs, conferences.',
      must_cover: ['self-serve', 'sales', 'partnerships'],
      must_not_cover: []
    },
    CUSTOMER_RELATIONSHIPS: {
      ground_truth:
        'Self-service onboarding for SMB / startups; dedicated account management for larger accounts; embedded support and concierge for premium tiers; controllers community + content for finance leaders.',
      must_cover: ['self-service', 'account management', 'support'],
      must_not_cover: []
    },
    REVENUE_STREAMS: {
      ground_truth:
        'Interchange fees from card spend (the dominant historical line), software subscriptions (Brex Empower), interest / yield on banking balances, FX and international payments fees.',
      must_cover: ['interchange', 'subscription', 'interest income'],
      must_not_cover: ['ads']
    },
    KEY_RESOURCES: {
      ground_truth:
        'Banking + card-issuing infrastructure (BIN sponsor relationships), risk + underwriting models tuned for startup balance-sheet underwriting, software platform (Empower), brand among CFOs + founders, customer-data + spend-data flywheel.',
      must_cover: ['risk models', 'banking infrastructure', 'software platform'],
      must_not_cover: []
    },
    KEY_ACTIVITIES: {
      ground_truth:
        'Risk + underwriting + fraud operations, card and banking product engineering, regulatory + compliance (KYC / AML / BSA), accounting + ERP integrations, sales + customer success, customer support.',
      must_cover: ['underwriting', 'compliance', 'engineering'],
      must_not_cover: []
    },
    KEY_PARTNERSHIPS: {
      ground_truth:
        'Sponsor banks (Emigrant Bank historically, now Column / others), card networks (Visa / Mastercard), accounting + ERP vendors (NetSuite, QuickBooks, Xero), VC firms + accelerators (YC), travel inventory partners (TripActions/Navan-style).',
      must_cover: ['sponsor bank', 'card networks', 'accounting integrations'],
      must_not_cover: []
    },
    COST_STRUCTURE: {
      ground_truth:
        'Credit + fraud losses (the canonical cost line for any card issuer), engineering + product (large fixed line), sales + marketing for mid-market growth, compliance + risk operations, partner banking + interchange-share economics.',
      must_cover: ['credit losses', 'engineering', 'compliance'],
      must_not_cover: ['inventory cost']
    }
  },

  annotator_id: 'sheng-internal',
  annotation_quality: 'draft',
  notes:
    'Tests fintech that is NOT Stripe-style API infra — the dominant cost line is credit/fraud losses, not COGS-style server cost. Underweighting credit losses or missing the sponsor-bank dependency would be a classic BMC mistake (treating Brex as if it were a SaaS).'
}
