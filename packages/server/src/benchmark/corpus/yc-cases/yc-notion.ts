/**
 * Notion (W14) — consumer-saas / b2b-saas crossover.
 *
 * Tests the BMC pipeline on a "blocks-based productivity" cross-segment
 * SaaS that grew bottom-up via consumer use → team plans → enterprise.
 */

import type { YcCompanyCase } from './yc-company-schema.js'

export const ycNotionCase: YcCompanyCase = {
  case_id: 'yc-notion-2024',
  company_name: 'Notion',
  yc_batch: 'W14',
  source_url: 'https://www.ycombinator.com/companies/notion',
  fetched_at: '2026-04-27',

  one_liner: 'A unified workspace for notes, docs, projects, wikis, and databases.',
  description:
    'Notion is an all-in-one workspace where you can write, plan, collaborate, and get organized. It combines docs, wikis, and project management into a single connected workspace built on flexible "blocks" that users can compose into pages, databases, and views. Used by individuals, teams, and enterprises (Pixar, Nike, Loom).',
  website: 'https://notion.so',

  sector: 'consumer-saas',
  outcome: 'active',
  stage_at_outcome: 'late-stage',
  outcome_year: 2024,

  ground_truth_bmc: {
    CUSTOMER_SEGMENTS: {
      ground_truth:
        'Bottom-up adoption: solo professionals + students for personal productivity, growing into team workspaces and enterprise tier. Designers, PMs, founders especially over-represented.',
      must_cover: ['individuals', 'teams', 'enterprise'],
      must_not_cover: ['developers-only', 'gaming']
    },
    VALUE_PROPOSITIONS: {
      ground_truth:
        'One flexible workspace replaces 5+ tools (Docs / Wiki / Tasks / Tables). "Blocks" composition gives unlimited customisation without code; AI features (Notion AI) added on top.',
      must_cover: ['blocks', 'all-in-one', 'flexible'],
      must_not_cover: []
    },
    CHANNELS: {
      ground_truth:
        'Self-serve sign-up (free tier is generous), viral product spread (public Notion pages, templates), creator-economy templates marketplace, enterprise sales for large accounts.',
      must_cover: ['self-serve', 'templates', 'viral'],
      must_not_cover: []
    },
    CUSTOMER_RELATIONSHIPS: {
      ground_truth:
        'Self-service for the long tail; creator + ambassador community; in-product onboarding; enterprise customer-success teams.',
      must_cover: ['self-service', 'community'],
      must_not_cover: []
    },
    REVENUE_STREAMS: {
      ground_truth:
        'Freemium subscription tiers (free → Plus → Business → Enterprise); per-seat pricing on paid tiers; Notion AI as paid add-on.',
      must_cover: ['subscription', 'freemium', 'per-seat'],
      must_not_cover: ['ads', 'one-time license']
    },
    KEY_RESOURCES: {
      ground_truth:
        'Block-based engine and database engine, brand among knowledge workers, creator template ecosystem, AI integration with model providers, large existing user base / network effects.',
      must_cover: ['engineering', 'community', 'AI'],
      must_not_cover: []
    },
    KEY_ACTIVITIES: {
      ground_truth:
        'Building + scaling the workspace platform, AI feature development, enterprise security/compliance work, community + creator program operations, mobile + offline sync.',
      must_cover: ['platform engineering', 'AI features', 'community'],
      must_not_cover: []
    },
    KEY_PARTNERSHIPS: {
      ground_truth:
        'AI model providers (OpenAI / Anthropic) for Notion AI, integrations partners (Slack, GitHub, Figma), enterprise channel partners, creator economy template-sellers.',
      must_cover: ['AI providers', 'integrations'],
      must_not_cover: []
    },
    COST_STRUCTURE: {
      ground_truth:
        'Engineering (largest fixed line), AI inference costs (variable, scaling with adoption), cloud infrastructure, customer support + customer success, sales + marketing for enterprise tier.',
      must_cover: ['engineering', 'AI inference', 'cloud infrastructure'],
      must_not_cover: ['inventory cost']
    }
  },

  annotator_id: 'sheng-internal',
  annotation_quality: 'draft',
  notes:
    'Cross-segment SaaS: bottom-up consumer → enterprise. Tests whether the BMC pipeline picks up "blocks" as a distinguishing primitive, and whether it correctly identifies the freemium + per-seat model.'
}
