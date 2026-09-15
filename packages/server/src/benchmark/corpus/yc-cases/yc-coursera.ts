/**
 * Coursera (NOT YC, but tracked here as Tier-A representative for the
 * MOOC / edtech sector since it's the classic case in business-model
 * literature and its public profile is comparable to YC companies).
 *
 * NOTE: Coursera was not actually a YC alum. We include it here as an
 * "extended Tier-A" case to broaden sector coverage. yc_batch is set
 * to 'F25' as a placeholder and the source_url points to Coursera's
 * own About page rather than YC. The annotator notes flag this.
 */

import type { YcCompanyCase } from './yc-company-schema.js'

export const ycCourseraCase: YcCompanyCase = {
  case_id: 'extended-coursera-2024',
  company_name: 'Coursera',
  yc_batch: 'F25', // placeholder — not YC; extended-tier sector representative
  source_url: 'https://about.coursera.org/',
  fetched_at: '2026-04-27',

  one_liner: 'Online courses and degrees from world-class universities and companies.',
  description:
    'Coursera operates an online learning platform offering courses, specializations, professional certificates, and degrees from 200+ universities and industry partners (Google, IBM, Meta, etc.). Mix of free auditing and paid certifications + degree programs.',
  website: 'https://www.coursera.org',

  sector: 'edtech',
  outcome: 'public',
  stage_at_outcome: 'late-stage',
  outcome_year: 2021,

  ground_truth_bmc: {
    CUSTOMER_SEGMENTS: {
      ground_truth:
        'Three primary segments: (1) self-directed adult learners reskilling / upskilling, (2) university students seeking online degrees, (3) enterprise L&D buyers (Coursera for Business / Government).',
      must_cover: ['adult learners', 'enterprise', 'students'],
      must_not_cover: []
    },
    VALUE_PROPOSITIONS: {
      ground_truth:
        'Brand-name university content + industry-validated certificates at a fraction of traditional tuition; enterprise tier offers measurable workforce-skill outcomes.',
      must_cover: ['university content', 'certificates', 'affordable'],
      must_not_cover: []
    },
    CHANNELS: {
      ground_truth:
        'SEO/web search (largest learner-acquisition channel), partner-co-marketing (universities/employers), B2B enterprise sales, mobile app, paid acquisition.',
      must_cover: ['SEO', 'partner co-marketing', 'enterprise sales'],
      must_not_cover: []
    },
    CUSTOMER_RELATIONSHIPS: {
      ground_truth:
        'Self-service for individuals; cohort + mentor support for paid degrees; account management for enterprise; community discussion forums per course.',
      must_cover: ['self-service', 'community'],
      must_not_cover: []
    },
    REVENUE_STREAMS: {
      ground_truth:
        'Subscription (Coursera Plus), individual course/certificate purchases, degree-program tuition (revenue-shared with universities), enterprise B2B subscription.',
      must_cover: ['subscription', 'tuition', 'enterprise'],
      must_not_cover: ['ads-only']
    },
    KEY_RESOURCES: {
      ground_truth:
        'Catalog of university-grade content (very hard to replicate), university + industry partner relationships, brand trust with HR buyers, learning-platform engineering, learner data.',
      must_cover: ['content catalog', 'partner relationships', 'brand'],
      must_not_cover: []
    },
    KEY_ACTIVITIES: {
      ground_truth:
        'Content partnerships and content-quality curation, learning-platform engineering, enterprise sales, learner success / support, regulatory compliance for accredited degrees.',
      must_cover: ['content curation', 'partner management', 'enterprise sales'],
      must_not_cover: []
    },
    KEY_PARTNERSHIPS: {
      ground_truth:
        'Universities (revenue share for degrees), industry partners producing professional certificates (Google, IBM, Meta), accreditation bodies, enterprise customers.',
      must_cover: ['universities', 'industry partners'],
      must_not_cover: []
    },
    COST_STRUCTURE: {
      ground_truth:
        'Revenue share to content partners (largest variable cost), engineering, sales+marketing (consumer + enterprise), customer support, content production grants/incentives, infrastructure.',
      must_cover: ['revenue share', 'sales-marketing'],
      must_not_cover: ['inventory cost']
    }
  },

  annotator_id: 'sheng-internal',
  annotation_quality: 'draft',
  notes:
    'NOT a YC alum — extended-tier edtech representative. case_id prefix is "extended-" to make this filterable in evaluator. yc_batch field is a placeholder.'
}
