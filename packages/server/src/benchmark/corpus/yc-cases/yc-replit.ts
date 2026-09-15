/**
 * Replit (W18) — devtools / consumer-saas
 *
 * Active developer-tools company; reference case for AI-assisted
 * developer products in the post-2023 boom.
 */

import type { YcCompanyCase } from './yc-company-schema.js'

export const ycReplitCase: YcCompanyCase = {
  case_id: 'yc-replit-2024',
  company_name: 'Replit',
  yc_batch: 'W18',
  source_url: 'https://www.ycombinator.com/companies/replit',
  fetched_at: '2026-04-27',

  one_liner:
    'Browser-based collaborative IDE that lets anyone code, ship, and run software from any device.',
  description:
    'Replit is a browser-based IDE and development platform that supports 50+ languages, with one-click hosting/deployment and AI-assisted coding (Replit AI / Ghostwriter). Aimed at hobbyists, students, and increasingly indie developers shipping production apps.',
  website: 'https://replit.com',

  sector: 'devtools',
  outcome: 'active',
  stage_at_outcome: 'series-b-plus',
  outcome_year: 2024,

  ground_truth_bmc: {
    CUSTOMER_SEGMENTS: {
      ground_truth:
        'Three overlapping segments: (1) hobbyist / learning developers, (2) students + educators in coding bootcamps and CS classrooms, (3) indie developers shipping production apps without DevOps overhead.',
      must_cover: ['hobbyist', 'students', 'indie developers'],
      must_not_cover: ['enterprise IT only']
    },
    VALUE_PROPOSITIONS: {
      ground_truth:
        'Zero-setup development environment in the browser; collaborative coding (Google-Docs-like multiplayer); AI-assisted code generation; one-click hosting.',
      must_cover: ['browser-based', 'no setup', 'AI'],
      must_not_cover: []
    },
    CHANNELS: {
      ground_truth:
        'Self-serve sign-up, viral sharing of public Repls, education partnerships, developer YouTube / Twitter content marketing, programming-tutorial integrations.',
      must_cover: ['self-serve', 'viral sharing', 'education'],
      must_not_cover: []
    },
    CUSTOMER_RELATIONSHIPS: {
      ground_truth:
        'Self-service for the long tail; community forums + discord; educator-focused programs (Replit for Teams); paid-tier email support.',
      must_cover: ['community', 'self-service'],
      must_not_cover: []
    },
    REVENUE_STREAMS: {
      ground_truth:
        'Freemium subscription tiers (free → Replit Core paid → Teams/Enterprise), AI usage credits, education-licence enterprise contracts.',
      must_cover: ['subscription', 'freemium', 'AI credits'],
      must_not_cover: ['ads-only']
    },
    KEY_RESOURCES: {
      ground_truth:
        'Container/VM cloud infrastructure (replit runs millions of sandboxes), engineering talent (notably AI infra), developer brand, repository of public Repls, AI models (custom + 3rd party).',
      must_cover: ['cloud infrastructure', 'engineering', 'AI models'],
      must_not_cover: []
    },
    KEY_ACTIVITIES: {
      ground_truth:
        'Building + scaling the cloud development environment, AI feature development, community moderation, education-program operations.',
      must_cover: ['cloud infrastructure', 'AI features'],
      must_not_cover: []
    },
    KEY_PARTNERSHIPS: {
      ground_truth:
        'Cloud infrastructure providers (GCP, AWS), AI model providers (OpenAI, Anthropic), education institutions for bulk licenses, deployment platforms (Vercel, Cloudflare for hosted apps).',
      must_cover: ['cloud providers', 'AI providers'],
      must_not_cover: []
    },
    COST_STRUCTURE: {
      ground_truth:
        'Compute infrastructure (the dominant variable cost — running millions of sandboxes), AI inference costs, engineering R&D salaries, education-program ops, marketing.',
      must_cover: ['compute', 'AI inference', 'engineering'],
      must_not_cover: []
    }
  },

  annotator_id: 'sheng-internal',
  annotation_quality: 'draft',
  notes:
    'Multi-segment + freemium + AI-cost-heavy. Tests the BMC pipeline\'s ability to handle a non-trivial cost structure (compute vs. AI inference vs. engineering).'
}
