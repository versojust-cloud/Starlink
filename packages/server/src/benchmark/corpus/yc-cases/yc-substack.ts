/**
 * Substack (W18) — media / creator economy.
 *
 * Reference for newsletter-led creator subscriptions. First "media"
 * sector case in the Tier-A corpus and the cleanest example of a
 * platform whose KEY_PARTNERSHIPS centre on the creators themselves
 * (rather than on traditional supplier relationships).
 */

import type { YcCompanyCase } from './yc-company-schema.js'

export const ycSubstackCase: YcCompanyCase = {
  case_id: 'yc-substack-2024',
  company_name: 'Substack',
  yc_batch: 'W18',
  source_url: 'https://www.ycombinator.com/companies/substack',
  fetched_at: '2026-04-28',

  one_liner: 'A subscription publishing platform — writers, podcasters, and video creators run their own paid media business.',
  description:
    'Substack lets writers, podcasters, and video creators publish to a subscription audience and run their own media business. Creators host newsletters / podcasts / video, accept paid subscriptions, build community via Notes (the Twitter-like surface) and Chat, and own their email list directly. Substack takes a 10% revenue share on paid subscriptions plus payment-processing pass-through. Has expanded from text-only to multi-format and recently invested heavily in social discovery.',
  website: 'https://substack.com',

  sector: 'media',
  outcome: 'active',
  stage_at_outcome: 'series-b-plus',
  outcome_year: 2024,

  ground_truth_bmc: {
    CUSTOMER_SEGMENTS: {
      ground_truth:
        'Two-sided: (1) creators — independent writers, journalists, podcasters, and video creators wanting direct paid relationships with audience; (2) readers / listeners / viewers — subscribers paying for niche content. Discovery-driven casual readers form an indirect third side.',
      must_cover: ['writers', 'subscribers', 'podcasters'],
      must_not_cover: ['enterprise IT']
    },
    VALUE_PROPOSITIONS: {
      ground_truth:
        'For creators: zero-setup paid newsletter/podcast/video business, owned email list, no platform algorithm gatekeeping, integrated payments + community + cross-creator discovery. For subscribers: direct support of writers, ad-free reading, niche depth.',
      must_cover: ['paid newsletters', 'creator monetisation', 'owned audience'],
      must_not_cover: ['ad-supported only']
    },
    CHANNELS: {
      ground_truth:
        'Self-service creator sign-up; creator-led growth (each writer markets to their own audience); cross-promotion via Notes social feed and recommendation network between Substacks; mobile + web app; creator-success and Substack Pro recruitment for top writers.',
      must_cover: ['self-service', 'creator-led growth', 'social discovery'],
      must_not_cover: []
    },
    CUSTOMER_RELATIONSHIPS: {
      ground_truth:
        'Self-service for the long tail of creators + readers; high-touch white-glove for top creators (Substack Pro deals); community + discovery via Notes / recommendations; subscription billing relationships managed on creator behalf.',
      must_cover: ['self-service', 'creator support', 'recommendations'],
      must_not_cover: []
    },
    REVENUE_STREAMS: {
      ground_truth:
        '10% revenue share on paid subscriptions (the dominant line) + Stripe processing pass-through (~3% to Stripe). No advertising. Some upfront advances to top creators (Substack Pro), recouped from subsequent revenue share.',
      must_cover: ['revenue share', 'subscription'],
      must_not_cover: ['advertising', 'one-time license']
    },
    KEY_RESOURCES: {
      ground_truth:
        'Publishing + email + audio + video infrastructure, brand among independent writers, recommendation/discovery graph between Substacks, creator network and exclusive Pro contracts, integrated payments stack.',
      must_cover: ['publishing platform', 'creator network', 'recommendation graph'],
      must_not_cover: []
    },
    KEY_ACTIVITIES: {
      ground_truth:
        'Operating publishing + email + audio + video platform, growing the creator base + Pro recruiting, building social/discovery surfaces (Notes), trust + safety + content moderation, payments + tax operations on creators\' behalf.',
      must_cover: ['platform engineering', 'creator recruitment', 'moderation'],
      must_not_cover: []
    },
    KEY_PARTNERSHIPS: {
      ground_truth:
        'Top writers / creators themselves (Substack Pro contracts), Stripe (payments), email-deliverability infrastructure providers (SendGrid / Postmark / similar), audio/video CDN providers, integrations (Spotify for podcasts, RSS).',
      must_cover: ['top creators', 'Stripe', 'email infrastructure'],
      must_not_cover: []
    },
    COST_STRUCTURE: {
      ground_truth:
        'Engineering + product (largest fixed line), Stripe processing fees passed through, email + audio/video infrastructure scaling with subscriber + content volume, Substack Pro creator advances, content moderation + trust-and-safety operations, marketing.',
      must_cover: ['engineering', 'creator advances', 'infrastructure'],
      must_not_cover: ['inventory cost']
    }
  },

  annotator_id: 'sheng-internal',
  annotation_quality: 'draft',
  notes:
    'First media sector case. Tests whether the pipeline correctly identifies (a) revenue share as a take-rate model (vs SaaS subscription per-seat), (b) creators as KEY_PARTNERSHIPS rather than just CUSTOMER_SEGMENTS, and (c) the must_not_cover violation if any agent claims advertising as a revenue stream.'
}
