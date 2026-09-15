/**
 * Stripe (S09) — fintech / payments / b2b-saas
 *
 * Hand-curated case from public YC + media information. Used as a
 * reference for "successful, well-documented" companies in the Tier A
 * benchmark. Outcome = `public` (IPO planned/in motion).
 *
 * Provenance: ycombinator.com/companies/stripe (public listing) +
 * Stripe's own public website + general media coverage.
 */

import type { YcCompanyCase } from './yc-company-schema.js'

export const ycStripeCase: YcCompanyCase = {
  case_id: 'yc-stripe-2024',
  company_name: 'Stripe',
  yc_batch: 'S09',
  source_url: 'https://www.ycombinator.com/companies/stripe',
  fetched_at: '2026-04-27',

  one_liner: 'Online payments for internet businesses.',
  description:
    'Stripe is a software platform for starting and running internet businesses. Millions of businesses rely on Stripe’s software tools to accept payments, expand globally, and manage their businesses online. Stripe has been at the forefront of expanding internet commerce, powering new business models, and supporting the latest platforms, from marketplaces to mobile commerce sites.',
  website: 'https://stripe.com',

  sector: 'fintech',
  outcome: 'active',
  stage_at_outcome: 'late-stage',
  outcome_year: 2024,

  ground_truth_bmc: {
    CUSTOMER_SEGMENTS: {
      ground_truth:
        'Internet businesses of all sizes — from indie SaaS founders to Fortune 500 marketplaces — that need to accept online payments.',
      must_cover: ['internet businesses', 'developers', 'marketplaces'],
      must_not_cover: ['offline retail-only', 'cash-only']
    },
    VALUE_PROPOSITIONS: {
      ground_truth:
        'Best-in-class developer experience for accepting payments globally — minimal integration friction, broad payment-method coverage, and a unified API across geographies.',
      must_cover: ['developer experience', 'API', 'global'],
      must_not_cover: []
    },
    CHANNELS: {
      ground_truth:
        'Self-serve developer signup, comprehensive technical docs, integration partners (Shopify, e-commerce platforms), enterprise sales for large accounts.',
      must_cover: ['self-serve', 'docs', 'integrations'],
      must_not_cover: ['retail stores']
    },
    CUSTOMER_RELATIONSHIPS: {
      ground_truth:
        'Largely self-service for the long tail; tiered support with dedicated account management for large enterprises; active developer community and changelog.',
      must_cover: ['self-service', 'developer community'],
      must_not_cover: []
    },
    REVENUE_STREAMS: {
      ground_truth:
        'Per-transaction fee on payments processed (typical 2.9% + $0.30 in the US), plus tiered/upsell pricing for adjacent products (Connect, Billing, Atlas, Capital).',
      must_cover: ['transaction fee', 'percentage'],
      must_not_cover: ['ads', 'one-time license']
    },
    KEY_RESOURCES: {
      ground_truth:
        'Engineering organisation, financial-services licenses globally, the issuing/acquiring banking partnerships, brand trust with developers, fraud-modelling data.',
      must_cover: ['engineering', 'licenses', 'banking partners'],
      must_not_cover: []
    },
    KEY_ACTIVITIES: {
      ground_truth:
        'Building and operating payments infrastructure, regulatory compliance across 40+ countries, fraud prevention, building adjacent financial products.',
      must_cover: ['payments infrastructure', 'compliance', 'fraud'],
      must_not_cover: []
    },
    KEY_PARTNERSHIPS: {
      ground_truth:
        'Card networks (Visa, Mastercard, Amex), acquiring/issuing banks per geography, alternative-payment-method providers, e-commerce platforms (Shopify), enterprise distribution partners.',
      must_cover: ['card networks', 'banks'],
      must_not_cover: []
    },
    COST_STRUCTURE: {
      ground_truth:
        'Card-network interchange + assessment fees (largest line), engineering / R&D salaries, banking-partner fees, fraud losses + chargeback handling, regulatory compliance ops, sales for enterprise.',
      must_cover: ['interchange', 'engineering salaries', 'compliance'],
      must_not_cover: []
    }
  },

  annotator_id: 'sheng-internal',
  annotation_quality: 'draft',
  notes:
    'High-information case — Stripe is heavily documented. Use as a "ceiling" benchmark — if the BMC pipeline can\'t produce a coherent Stripe BMC, something is broken.',

  // Stage 6: KB seed for the citation eval. Snippets are paraphrased from
  // public Stripe disclosures + general industry knowledge — short enough
  // for agents to cite specifically by id, long enough to carry concrete
  // claims. Each doc_id+chunk pair becomes a citable [[ref:doc#chunk]]
  // target the citation parser can resolve.
  workspace_knowledge: [
    {
      doc_id: 'stripe-pricing-2024',
      title: 'Stripe Public Pricing (US, 2024)',
      content:
        'Stripe charges 2.9% + $0.30 per successful card transaction in the United States, with international cards adding 1.5%. Subscription products (Stripe Billing) carry an additional 0.5–0.8% layer on recurring revenue. Connect (marketplaces / platforms) introduces account fees plus volume tiers. Custom enterprise pricing is available for >$80M annual volume.'
    },
    {
      doc_id: 'stripe-developer-experience-2023',
      title: 'Why Developers Choose Stripe (industry analysis)',
      content:
        'Stripe\'s documentation site (stripe.com/docs) is widely cited as the gold standard for API docs in fintech: live code samples, language switchers, and a fully functional test mode that mirrors production. The CLI tool ships event simulation locally. Combined with libraries in 8+ languages, the typical "first successful charge" timeline for a new developer is under 30 minutes — a concrete advantage over legacy gateways like Authorize.net or Braintree.'
    },
    {
      doc_id: 'stripe-banking-partners-2024',
      title: 'Stripe Banking and Card-Network Partnerships',
      content:
        'Stripe operates as a payment facilitator on top of acquiring partners: Wells Fargo and JPMorgan Chase in the US, Barclays in the UK, and various regional acquirers in 40+ countries. It maintains direct relationships with Visa, Mastercard, American Express, and JCB for card-network access. Issuing (Stripe Issuing) requires bank-sponsorship arrangements; the Atlanta-based Goldfinch Bank is the primary issuing partner for US prepaid programs.'
    },
    {
      doc_id: 'card-interchange-economics-2023',
      title: 'Interchange Fee Economics (US merchant card payments)',
      content:
        'Of every dollar Stripe (or any payment facilitator) collects from a US card transaction, roughly 70–80% flows to the issuing bank as interchange (set by Visa/Mastercard schedules), 5–10% to the card network as assessment, and 5–10% to the acquiring bank. Stripe\'s gross margin on the residual ~10–15% covers fraud losses, infrastructure, and engineering. This explains why payment facilitator margins are structurally thin and why scale + fraud-loss reduction are the dominant levers.'
    }
  ]
}
